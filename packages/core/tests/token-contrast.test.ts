import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import ts from "typescript";
import { expect, test } from "vite-plus/test";
import { tokenKind, tokensFile, tokenValues } from "../../../scripts/tokens.mjs";

type Minimum = { ratio: number; criterion: string };
type Conditional = Map<string, ts.Expression>;
type Block = { name: string; properties: Map<string, Conditional> };
type Side = { property: string; token: string | undefined; written: string };
type Pairing = { where: string; foreground: Side; background: Side; minimum: Minimum };

const minimumContrast: [property: RegExp, minimum: Minimum][] = [
  [/^color$/, { ratio: 4.5, criterion: "WCAG 1.4.3" }],
  [/^(?:border\w*Color|outlineColor)$/, { ratio: 3, criterion: "WCAG 1.4.11" }],
];
const pageBackground = "--solix-color-body";
const repositoryRoot = join(import.meta.dirname, "../../..");
const sourceDirectory = dirname(tokensFile);

const remLength = /^\d+(?:\.\d+)?rem$/;
const number = String.raw`(\d+(?:\.\d+)?|\.\d+)`;
const oklchNotation = new RegExp(
  String.raw`^oklch\(${number} ${number} ${number}(?: / ${number})?\)$`,
);
const gamutTolerance = 1e-4;

type Oklch = { lightness: number; chroma: number; hue: number; alpha: number };

const tokens = tokenValues();
const colourTokens = Object.keys(tokens).filter((name) => tokenKind(name) === "colour");
const lengthTokens = Object.keys(tokens).filter((name) => tokenKind(name) !== "colour");

function oklch(value: string): Oklch | undefined {
  const match = oklchNotation.exec(value);
  if (!match) return undefined;
  const [lightness, chroma, hue] = match.slice(1, 4).map(Number);
  return { lightness, chroma, hue, alpha: match[4] === undefined ? 1 : Number(match[4]) };
}

function opaqueColour(name: string): Oklch | undefined {
  const colour = oklch(tokens[name]);
  return colour?.alpha === 1 ? colour : undefined;
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

function relativeLuminance(colour: Oklch): number {
  const [red, green, blue] = linearSrgb(colour);
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrastRatio(first: Oklch, second: Oklch): number {
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
  const source = ts.createSourceFile(
    file,
    readFileSync(join(repositoryRoot, file), "utf8"),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
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
    ts.forEachChild(node, visit);
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
    return [...conditions].flatMap((condition) =>
      foregrounds.map(({ property, values, minimum }) => ({
        where: `${file} styles.${name} (${condition})`,
        foreground: side(property, values, condition, root),
        background: background
          ? side("backgroundColor", background, condition, root)
          : { property: "the page", token: pageBackground, written: pageBackground },
        minimum,
      })),
    );
  });
}

const pairings = readdirSync(join(repositoryRoot, sourceDirectory))
  .filter((entry) => entry.endsWith(".tsx"))
  .sort()
  .flatMap((entry) => pairingsIn(join(sourceDirectory, entry)));

test("every colour token is written in OKLCH", () => {
  const violations = colourTokens
    .filter((name) => oklch(tokens[name]) === undefined)
    .map(
      (name) =>
        `${name} is "${tokens[name]}" in ${tokensFile}. Write it as oklch(L C H), or as oklch(L C H / A) for a translucent colour.`,
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

test("every colour token lies inside sRGB", () => {
  const violations = colourTokens.flatMap((name) => {
    const colour = oklch(tokens[name]);
    if (!colour) return [];
    const channels = linearSrgb(colour);
    const inside = channels.every(
      (channel) => channel >= -gamutTolerance && channel <= 1 + gamutTolerance,
    );
    return inside
      ? []
      : [
          `${name} is "${tokens[name]}", outside sRGB (linear red, green, blue ${channels.map((channel) => channel.toFixed(4)).join(", ")}). Lower its chroma in ${tokensFile}.`,
        ];
  });

  expect(violations).toEqual([]);
});

test("in every stylex.create block and condition, text and borders meet their contrast against the background", () => {
  const violations = pairings.flatMap(({ where, foreground, background, minimum }) => {
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
    const frontColour = opaqueColour(front);
    const backColour = opaqueColour(back);
    const pair = `${foreground.property} ${front} on ${background.property} ${back}`;
    if (!frontColour || !backColour) {
      return [
        `${where}: ${pair} cannot be measured. Make both opaque OKLCH colours in ${tokensFile}.`,
      ];
    }
    const ratio = contrastRatio(frontColour, backColour);
    return ratio >= minimum.ratio
      ? []
      : [
          `${where}: ${pair} has contrast ${ratio.toFixed(2)}:1, below the ${minimum.ratio}:1 that ${minimum.criterion} asks for. Change one of them in ${tokensFile}.`,
        ];
  });

  expect(pairings.length).toBeGreaterThan(0);
  expect(violations).toEqual([]);
});
