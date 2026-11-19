import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { expect, test } from "vite-plus/test";
import {
  colorVariantTable,
  isShade,
  type Palette,
  palettes,
  paletteToken,
} from "#/src/color-table.ts";
import { contrastExceptions } from "../../../tests/support/contrast-exceptions";
import { fileNamedBy } from "../../../scripts/subpath";
import { schemeValues, tokenKind, tokensFile, tokenValues } from "../../../scripts/tokens";
import { parse, ts } from "../../../scripts/syntax";

type Minimum = { ratio: number; criterion: string };
type Conditional = Map<string, ts.Expression>;
type Block = { name: string; properties: Map<string, Conditional> };
type Side = { property: string; token: string | undefined; written: string; slot?: string };
type Pairing = { where: string; foreground: Side; background: Side; minimum: Minimum };

const minimumContrast: [property: RegExp, minimum: Minimum][] = [
  [/^color$/, { ratio: 4.5, criterion: "WCAG 1.4.3" }],
  [/^(?:border\w*Color|outlineColor)$/, { ratio: 3, criterion: "WCAG 1.4.11" }],
];
const pageBackground = "--solix-color-body";
const repositoryRoot = join(import.meta.dirname, "../../..");
const sourceDirectory = dirname(tokensFile);
const variantColorsFile = join(repositoryRoot, sourceDirectory, "variant-colors.stylex.ts");

const remLength = /^\d+(?:\.\d+)?rem$/;
const number = String.raw`(\d+(?:\.\d+)?|\.\d+)`;
const oklchText = String.raw`oklch\(${number} ${number} ${number}(?: / ${number})?\)`;
const oklchNotation = new RegExp(`^${oklchText}$`);
const schemes = ["light", "dark"] as const;
type Scheme = (typeof schemes)[number];
const gamutTolerance = 1e-4;

type Oklch = { lightness: number; chroma: number; hue: number; alpha: number };

const tokens = tokenValues();
const colourTokens = Object.keys(tokens).filter((name) => tokenKind(name) === "colour");
const shadowTokens = Object.keys(tokens).filter((name) => tokenKind(name) === "shadow");
const variants = Object.entries(colorVariantTable);
const lengthTokens = Object.keys(tokens).filter(
  (name) => !["colour", "shadow"].includes(tokenKind(name)),
);
const shadowLength = String.raw`(?:0|-?${number}rem)`;
const oneShadow = new RegExp(`^(?:${shadowLength} ){2,4}${oklchText}$`);
const commaOutsideBrackets = /,\s*(?![^(]*\))/;

function oklch(value: string): Oklch | undefined {
  const match = oklchNotation.exec(value);
  if (!match) return undefined;
  const [lightness, chroma, hue] = match.slice(1, 4).map(Number);
  return { lightness, chroma, hue, alpha: match[4] === undefined ? 1 : Number(match[4]) };
}

function valueIn(name: string, scheme: Scheme): string | undefined {
  return schemeValues(tokens[name])?.[scheme];
}

function colourIn(name: string, scheme: Scheme): Oklch | undefined {
  const value = valueIn(name, scheme);
  return value === undefined ? undefined : oklch(value);
}

type Rgb = readonly [red: number, green: number, blue: number];

function encoded(channel: number): number {
  const clamped = Math.min(1, Math.max(0, channel));
  return clamped <= 0.0031308 ? 12.92 * clamped : 1.055 * clamped ** (1 / 2.4) - 0.055;
}

function decoded(channel: number): number {
  return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
}

function over(top: Oklch, under: Rgb): Rgb {
  const [red, green, blue] = linearSrgb(top).map(encoded);
  return [
    red * top.alpha + under[0] * (1 - top.alpha),
    green * top.alpha + under[1] * (1 - top.alpha),
    blue * top.alpha + under[2] * (1 - top.alpha),
  ];
}

function opaque(colour: Oklch): Rgb {
  return over({ ...colour, alpha: 1 }, [0, 0, 0]);
}

function linearSrgb({ lightness, chroma, hue }: Oklch): [number, number, number] {
  const radians = (hue * Math.PI) / 180;
  const a = chroma * Math.cos(radians);
  const b = chroma * Math.sin(radians);
  const long = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const medium = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const short = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * long - 3.3077115913 * medium + 0.2309699292 * short,
    -1.2684380046 * long + 2.6097574011 * medium - 0.3413193965 * short,
    -0.0041960863 * long - 0.7034186147 * medium + 1.707614701 * short,
  ];
}

function relativeLuminance(colour: Rgb): number {
  const [red, green, blue] = colour.map(decoded);
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrastRatio(first: Rgb, second: Rgb): number {
  const [lighter, darker] = [relativeLuminance(first), relativeLuminance(second)].sort(
    (x, y) => y - x,
  );
  return (lighter + 0.05) / (darker + 0.05);
}

function keyText(name: ts.PropertyName): string {
  if (ts.isComputedPropertyName(name)) return name.expression.getText();
  return ts.isIdentifier(name) || ts.isStringLiteral(name) ? name.text : name.getText();
}

function conditional(value: ts.Expression): Conditional {
  if (!ts.isObjectLiteralExpression(value)) return new Map([["default", value]]);
  return new Map(
    value.properties
      .filter(ts.isPropertyAssignment)
      .map((property) => [keyText(property.name), property.initializer]),
  );
}

function blocksIn(name: string, style: ts.ObjectLiteralExpression): Block[] {
  const properties = new Map<string, Conditional>();
  const pseudoElements: Block[] = [];
  for (const property of style.properties.filter(ts.isPropertyAssignment)) {
    const key = keyText(property.name);
    if (key.startsWith("::") && ts.isObjectLiteralExpression(property.initializer)) {
      pseudoElements.push(...blocksIn(`${name}${key}`, property.initializer));
    } else {
      properties.set(key, conditional(property.initializer));
    }
  }
  return [{ name, properties }, ...pseudoElements];
}

function stylexBlocks(file: string): Block[] {
  const source = parse(join(repositoryRoot, file));
  const blocks: Block[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && node.expression.getText() === "stylex.create") {
      const [styles] = node.arguments;
      if (styles && ts.isObjectLiteralExpression(styles)) {
        for (const block of styles.properties.filter(ts.isPropertyAssignment)) {
          if (ts.isObjectLiteralExpression(block.initializer)) {
            blocks.push(...blocksIn(keyText(block.name), block.initializer));
          }
        }
      }
    }
    node.forEachChild(visit);
  };
  visit(source);
  return blocks;
}

function minimumFor(property: string): Minimum | undefined {
  return minimumContrast.find(([pattern]) => pattern.test(property))?.[1];
}

function valueUnder(values: Conditional, condition: string): ts.Expression | undefined {
  return values.get(condition) ?? values.get("default");
}

function variableIn(root: Block | undefined, value: ts.Expression): Conditional | undefined {
  return ts.isPropertyAccessExpression(value) ? root?.properties.get(value.getText()) : undefined;
}

function tokenReferencedBy(value: ts.Expression | undefined): string | undefined {
  return value &&
    ts.isElementAccessExpression(value) &&
    ts.isStringLiteral(value.argumentExpression) &&
    value.argumentExpression.text in tokens
    ? value.argumentExpression.text
    : undefined;
}

function importedFrom(identifier: ts.Identifier): string | undefined {
  const source = identifier.getSourceFile();
  const declaration = source.statements.filter(ts.isImportDeclaration).find((statement) => {
    const bindings = statement.importClause?.namedBindings;
    return (
      bindings !== undefined &&
      ts.isNamedImports(bindings) &&
      bindings.elements.some(({ name }) => name.text === identifier.text)
    );
  });
  return declaration && ts.isStringLiteral(declaration.moduleSpecifier)
    ? fileNamedBy(source.fileName, declaration.moduleSpecifier.text)
    : undefined;
}

function slotReferencedBy(value: ts.Expression | undefined): string | undefined {
  return value &&
    ts.isElementAccessExpression(value) &&
    ts.isIdentifier(value.expression) &&
    ts.isStringLiteral(value.argumentExpression) &&
    importedFrom(value.expression) === variantColorsFile
    ? value.argumentExpression.text
    : undefined;
}

function side(
  property: string,
  values: Conditional,
  condition: string,
  root: Block | undefined,
): Side {
  const written = valueUnder(values, condition);
  const variable = written && variableIn(root, written);
  const resolved = variable ? valueUnder(variable, condition) : written;
  return {
    property,
    slot: slotReferencedBy(resolved),
    token: tokenReferencedBy(resolved),
    written: variable
      ? `${written.getText()}, which the root block sets to ${resolved?.getText() ?? "nothing"}`
      : (written?.getText() ?? "nothing"),
  };
}

function conditionsOf(values: Conditional, root: Block | undefined): string[] {
  return [...values].flatMap(([condition, value]) => [
    condition,
    ...(variableIn(root, value)?.keys() ?? []),
  ]);
}

const thePage: Side = { property: "the page", token: pageBackground, written: pageBackground };

function slotToken(
  slot: string,
  palette: Palette,
  slots: Readonly<Record<string, string>>,
): string | undefined {
  const value = slots[slot];
  if (value === undefined || value === "transparent") return undefined;
  return isShade(value) ? paletteToken(palette, value) : value;
}

function inEachPaletteAndVariant(pairing: Pairing): Pairing[] {
  const { foreground, background } = pairing;
  if (foreground.slot === undefined && background.slot === undefined) return [pairing];
  return palettes.flatMap((palette) =>
    variants.flatMap(([variant, slots]): Pairing[] => {
      const resolve = (given: Side): Side | undefined => {
        if (given.slot === undefined) return given;
        const token = slotToken(given.slot, palette, slots);
        return token === undefined
          ? undefined
          : { ...given, token, written: `${given.written}, which is ${token}` };
      };
      const front = resolve(foreground);
      if (front === undefined) return [];
      return [
        {
          ...pairing,
          where: `${pairing.where} with color="${palette}" variant="${variant}"`,
          foreground: front,
          background: resolve(background) ?? thePage,
        },
      ];
    }),
  );
}

function drawnOutside(property: string, offset: ts.Expression | undefined): boolean {
  return (
    property === "outlineColor" && !(offset?.getText() ?? "").replace(/^["'`]/, "").startsWith("-")
  );
}

function pairingsIn(file: string): Pairing[] {
  const blocks = stylexBlocks(file);
  const root = blocks.find(({ name }) => name === "root");
  return blocks.flatMap(({ name, properties }) => {
    const background = properties.get("backgroundColor");
    const foregrounds = [...properties].flatMap(([property, values]) => {
      const minimum = minimumFor(property);
      return minimum ? [{ property, values, minimum }] : [];
    });
    const conditions = new Set(
      [...foregrounds.map(({ values }) => values), ...(background ? [background] : [])].flatMap(
        (values) => conditionsOf(values, root),
      ),
    );
    const offset = properties.get("outlineOffset");
    return [...conditions].flatMap((condition) =>
      foregrounds
        .map(({ property, values, minimum }) => ({
          where: `${file} styles.${name} (${condition})`,
          foreground: side(property, values, condition, root),
          background:
            background && !drawnOutside(property, offset && valueUnder(offset, condition))
              ? side("backgroundColor", background, condition, root)
              : thePage,
          minimum,
        }))
        .flatMap(inEachPaletteAndVariant),
    );
  });
}

const pairings = readdirSync(join(repositoryRoot, sourceDirectory))
  .filter((entry) => entry.endsWith(".tsx"))
  .sort()
  .flatMap((entry) => pairingsIn(join(sourceDirectory, entry)));

test("every colour token is written in OKLCH, once for the light scheme and once for the dark", () => {
  const violations = colourTokens
    .filter((name) => schemes.some((scheme) => colourIn(name, scheme) === undefined))
    .map(
      (name) =>
        `${name} is "${tokens[name]}" in ${tokensFile}. Write it as light-dark(<light>, <dark>), each oklch(L C H), or oklch(L C H / A) for a translucent colour.`,
    );

  expect(colourTokens.length).toBeGreaterThan(0);
  expect(violations).toEqual([]);
});

test("every other token is a length in rem, so it means the same wherever it is used", () => {
  const violations = lengthTokens
    .filter((name) => !remLength.test(tokens[name]))
    .map(
      (name) =>
        `${name} is "${tokens[name]}" in ${tokensFile}. Write a length in rem, or name the token --solix-color-* if it is a colour.`,
    );

  expect(lengthTokens.length).toBeGreaterThan(0);
  expect(violations).toEqual([]);
});

test("every shadow token is a list of shadows, each two to four lengths in rem or 0 and then an OKLCH colour", () => {
  const violations = shadowTokens
    .filter(
      (name) => !tokens[name].split(commaOutsideBrackets).every((shadow) => oneShadow.test(shadow)),
    )
    .map(
      (name) =>
        `${name} is "${tokens[name]}" in ${tokensFile}. Write each shadow as its offsets, blur and spread in rem or 0, then oklch(L C H / A), and separate the shadows with commas.`,
    );

  expect(shadowTokens.length).toBeGreaterThan(0);
  expect(violations).toEqual([]);
});

test("every colour token lies inside sRGB in both schemes", () => {
  const violations = colourTokens.flatMap((name) =>
    schemes.flatMap((scheme) => {
      const colour = colourIn(name, scheme);
      if (!colour) return [];
      const channels = linearSrgb(colour);
      const inside = channels.every(
        (channel) => channel >= -gamutTolerance && channel <= 1 + gamutTolerance,
      );
      return inside
        ? []
        : [
            `${name} is "${valueIn(name, scheme)}" in the ${scheme} scheme, outside sRGB (linear red, green, blue ${channels.map((channel) => channel.toFixed(4)).join(", ")}). Lower its chroma in ${tokensFile}.`,
          ];
    }),
  );

  expect(violations).toEqual([]);
});

const exceptionsFile = "tests/support/contrast-exceptions.ts";
const belowItsMinimum = new Set<string>();

function pairKey(foreground: string, background: string, scheme: Scheme): string {
  return `${foreground} on ${background} in the ${scheme} scheme`;
}

const excepted = new Set(
  contrastExceptions.map(({ foreground, background, scheme }) =>
    pairKey(foreground, background, scheme),
  ),
);

function measured({ where, foreground, background, minimum }: Pairing): string[] {
  const front = foreground.token;
  const back = background.token;
  if (front === undefined || back === undefined) {
    return [foreground, background]
      .filter(({ token }) => token === undefined)
      .map(
        ({ property, written }) =>
          `${where}: ${property} is ${written}, which is not a token. Use a --solix-color-* token from ${tokensFile}.`,
      );
  }
  return schemes.flatMap((scheme) => {
    const frontColour = colourIn(front, scheme);
    const backColour = colourIn(back, scheme);
    const page = colourIn(pageBackground, scheme);
    const pair = `${foreground.property} ${front} on ${background.property} ${back} in the ${scheme} scheme`;
    if (!frontColour || !backColour || page?.alpha !== 1) {
      return [
        `${where}: ${pair} cannot be measured. Make both OKLCH colours, and ${pageBackground} opaque, in ${tokensFile}.`,
      ];
    }
    const drawnOn = over(backColour, opaque(page));
    const ratio = contrastRatio(over(frontColour, drawnOn), drawnOn);
    if (ratio >= minimum.ratio) return [];
    const key = pairKey(front, back, scheme);
    belowItsMinimum.add(key);
    return excepted.has(key)
      ? []
      : [
          `${where}: ${pair} has contrast ${ratio.toFixed(2)}:1, below the ${minimum.ratio}:1 that ${minimum.criterion} asks for, and contrastExceptions in ${exceptionsFile} does not list it. Change one of them in ${tokensFile}.`,
        ];
  });
}

const violations = pairings.flatMap(measured);

test("in every stylex.create block and condition, in the light and the dark scheme, text and borders meet their contrast against the background, but for a pair contrastExceptions lists", () => {
  expect(pairings.length).toBeGreaterThan(0);
  expect(violations).toEqual([]);
});

test("every pair contrastExceptions lists is drawn by a component and still falls below its minimum, so the list cannot hold a pair that passes", () => {
  expect(contrastExceptions.length).toBeGreaterThan(0);
  expect(
    [...excepted]
      .filter((key) => !belowItsMinimum.has(key))
      .map(
        (key) =>
          `${key} is in contrastExceptions in ${exceptionsFile}, but no component draws it below its minimum any more. Take it off the list.`,
      ),
  ).toEqual([]);
});
