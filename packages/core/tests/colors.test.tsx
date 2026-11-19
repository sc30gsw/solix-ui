import fc from "fast-check";
import postcss from "postcss";
import type { CompiledStyles } from "@stylexjs/stylex";
import { expect, expectTypeOf, test, vi } from "vite-plus/test";
import { LIBRARY_CASCADE_LAYER } from "#/build-pipeline.mjs";
import {
  autoContrastClass,
  colorClass,
  colorClassPrefix,
  colorProperty,
  colorVariantTable,
  customColorClass,
  type Palette,
  type Shade,
  paletteClass,
  palettes,
  paletteToken,
  primaryAlias,
  primaryPalette,
  primaryProperty,
  shadeClass,
  shadeProperty,
  shades,
  shadeSource,
  slotDefaults,
  contrastLuminance,
  luminanceWeights,
  namedPalettes,
  ownPaletteOf,
  textWithoutAPalette,
  variantAttribute,
  writtenColor,
} from "#/src/color-table.ts";
import {
  colorLayer,
  colorSchemeLayer,
  libraryLayers,
  stylePropClassPrefix,
} from "#/src/style-prop-table.ts";
import { type ColorProps, resolveColor, type SolixColor } from "#/src/colors.ts";
import type { createParts, PartsOptions } from "#/src/parts.ts";
import { stylesheet } from "#/tests/built-library.ts";
import { layersAround } from "#/tests/cascade-layers.ts";
import { render } from "#/tests/fixtures.ts";
import { classesOf, declarationsIn, rootElementOf, valuesOf } from "#/tests/markup.ts";
import {
  mixedInOklab,
  type Oklch,
  oklabOf,
  parsedOklch,
  transparentOklch,
} from "../../../tests/support/oklch.ts";
import { assertProperty } from "../../../tests/support/properties.ts";
import { schemeValues, tokenKind, tokenValues } from "../../../scripts/tokens";

const primaryColorsFile = "packages/core/src/primary-colors.stylex.ts";
const named = namedPalettes;
const variants = Object.keys(colorVariantTable);
const slots = Object.keys(colorVariantTable.default.palette);

type Placed = { selector: string; declarations: Record<string, string>; layers: string[] };

function placed(): Placed[] {
  const found: Placed[] = [];
  postcss.parse(stylesheet).walkRules((rule) => {
    found.push({
      selector: rule.selector,
      declarations: Object.fromEntries(
        rule.nodes.flatMap((node) => (node.type === "decl" ? [[node.prop, node.value]] : [])),
      ),
      layers: layersAround(rule),
    });
  });
  return found;
}

const rules = placed();
const colourRules = rules.filter(({ layers }) => layers.includes(colorLayer));

function ruleFor(selector: string): Record<string, string> {
  return rules.find((rule) => rule.selector === selector)?.declarations ?? {};
}

function rootOf(props: Record<string, unknown>) {
  return rootElementOf(render("Button", props));
}

function styleOf(props: Record<string, unknown>): Record<string, string> {
  return Object.fromEntries(declarationsIn(valuesOf(rootOf(props), "style")[0]));
}

test("the colour tokens hold exactly one token for each shade of each palette of the colour table, and none for an alias", () => {
  const colourTokens = Object.keys(tokenValues()).filter((name) => tokenKind(name) === "colour");
  const ofAPalette = (name: string) =>
    named.some((palette) => name.startsWith(`--solix-color-${palette}-`));

  expect(colourTokens.filter(ofAPalette).toSorted()).toEqual(
    palettes.flatMap((palette) => shades.map((shade) => paletteToken(palette, shade))).toSorted(),
  );
});

test("every rule of the colours layer, the first sub-layer of the library's, selects a class with the colours' own prefix, which neither starts nor is started by the prefix of StyleX and the style props, and sets custom properties only", () => {
  expect(libraryLayers[0]).toBe(colorLayer);
  expect(colorClassPrefix.startsWith(stylePropClassPrefix)).toBe(false);
  expect(stylePropClassPrefix.startsWith(colorClassPrefix)).toBe(false);
  expect(colourRules.length).toBeGreaterThan(0);
  expect(
    colourRules.filter(
      ({ selector, declarations, layers }) =>
        !selector.startsWith(`.${colorClassPrefix}`) ||
        Object.keys(declarations).some((property) => !property.startsWith("--")) ||
        layers.join(" ") !== [colorLayer, LIBRARY_CASCADE_LAYER].join(" "),
    ),
  ).toEqual([]);
});

test("the primary's alias declares exactly the shades shadeSource names for the primary, in the order of the shades", () => {
  expect(Object.keys(tokenValues(primaryColorsFile))).toEqual(
    shades.map((shade) => shadeSource(primaryAlias, shade)),
  );
});

test.each(named)(
  "the class of %s sets every shade from its own palette's tokens, or for the primary from the primary's alias",
  (palette) => {
    expect(Object.values(ruleFor(`.${paletteClass(palette)}`))).toEqual(
      shades.map((shade) => `var(${shadeSource(palette, shade)})`),
    );
  },
);

test("the primary's alias is written once, on :root and on every element with a colour scheme, from the primary palette's tokens", () => {
  const aliases = rules.filter(
    ({ declarations, layers }) =>
      layers.includes(colorSchemeLayer) &&
      Object.keys(declarations).some((property) => property === primaryProperty("6")),
  );

  expect(aliases.map(({ selector }) => selector)).toEqual([":root,[data-color-scheme]"]);
  expect(aliases[0]?.declarations).toEqual(
    Object.fromEntries(
      shades.map((shade) => [
        primaryProperty(shade),
        `var(${paletteToken(primaryPalette, shade)})`,
      ]),
    ),
  );
});

test("an element with a colour class resets every slot to a default, so a variant the table does not hold falls back to the default variant and a custom variant that sets only its background and colour hovers on its background with no border", () => {
  const reset = ruleFor(`.${colorClass}`);

  expect(Object.keys(reset)).toEqual(slots);
  expect(reset).toEqual(slotDefaults);
  expect(reset["--solixc-variant-hover"]).toBe("var(--solixc-variant-background)");
  expect(valuesOf(rootOf({ variant: "nonsense" }), variantAttribute)).toEqual(["filled"]);
});

test.each(variants)(
  "the variant %s sets every slot for a palette, and for a given shade or colour reads that colour",
  (variant) => {
    const forAPalette = ruleFor(`.${colorClass}[${variantAttribute}="${variant}"]`);
    const forAShade = ruleFor(`.${shadeClass}[${variantAttribute}="${variant}"]`);
    const slotsReadingTheColor = Object.entries(
      colorVariantTable[variant as keyof typeof colorVariantTable].color,
    )
      .filter(([, value]) => value === writtenColor || typeof value !== "string")
      .map(([slot]) => slot);

    expect(Object.keys(forAPalette)).toEqual(slots);
    expect(Object.keys(forAShade)).toEqual(slots);
    expect(
      slotsReadingTheColor.filter((slot) => !forAShade[slot]?.includes(`var(${colorProperty})`)),
    ).toEqual([]);
  },
);

test.each(named)(
  "naming the palette %s gives its class and writes no custom property",
  (palette) => {
    expect(classesOf(rootOf({ color: palette }))).toEqual(
      expect.arrayContaining([colorClass, paletteClass(palette)]),
    );
    expect(styleOf({ color: palette })).toEqual({});
  },
);

test("with no color and no variant the root takes the primary palette and the component's default variant, and writes no custom property", () => {
  expect(classesOf(rootOf({}))).toEqual(
    expect.arrayContaining([colorClass, paletteClass(primaryAlias)]),
  );
  expect(styleOf({})).toEqual({});
  expect(valuesOf(rootOf({}), variantAttribute)).toEqual(["filled"]);
});

test("a shade of a palette gives the palette's class and the shade class and writes one custom property, the shade, through the primary's alias for the primary", () => {
  for (const palette of named) {
    for (const shade of shades) {
      const color = `${palette}.${shade}`;
      expect(classesOf(rootOf({ color }))).toEqual(
        expect.arrayContaining([colorClass, paletteClass(palette), shadeClass]),
      );
      expect(styleOf({ color })).toEqual({
        [colorProperty]: `var(${shadeSource(palette, shade)})`,
      });
    }
  }
});

test("autoContrast is off unless it is true: only then does the root take the class that computes the text from the solid shade", () => {
  expect(classesOf(rootOf({}))).not.toContain(autoContrastClass);
  expect(classesOf(rootOf({ autoContrast: false }))).not.toContain(autoContrastClass);
  expect(classesOf(rootOf({ autoContrast: true }))).toContain(autoContrastClass);
  expect(Object.keys(ruleFor(`.${shadeClass}`))).not.toContain(shadeProperty("contrast"));
});

test("any other CSS colour writes one custom property, itself, with the shade and custom classes, and a value that is no colour, such as red-6, blue.12, the typo bleu, the keyword inherit, Red in capitals or one that holds ;, { or }, falls back to the primary palette and writes nothing", async (context) => {
  await assertProperty(
    context,
    fc.property(
      fc.oneof(
        fc.stringMatching(/^#[0-9a-f]{6}$/).map((color) => ({ color, valid: true })),
        fc
          .constantFrom("oklch(0.5 0.1 20)", "rgb(10 20 30)", "transparent", "rebeccapurple")
          .map((color) => ({ color, valid: true })),
        fc
          .constantFrom("red-6", "blue.12", "#f00;", "red}", "a{b", "bleu", "inherit", "Red")
          .map((color) => ({ color, valid: false })),
      ),
      fc.constantFrom(...variants),
      ({ color, valid }, variant) => {
        const props = { color, variant };
        const classes = classesOf(rootOf(props));

        expect(valuesOf(rootOf(props), variantAttribute)).toEqual([variant]);
        if (valid) {
          expect(classes).toEqual(
            expect.arrayContaining([colorClass, shadeClass, customColorClass]),
          );
          expect(styleOf(props)).toEqual({ [colorProperty]: color });
        } else {
          expect(classes).toEqual(expect.arrayContaining([colorClass, paletteClass(primaryAlias)]));
          expect(styleOf(props)).toEqual({});
        }
      },
    ),
  );
});

test("on the server a color that is no colour falls back to the primary palette without a warning, which only the browser's development build gives", () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  try {
    expect(classesOf(rootOf({ color: "red-6" }))).toContain(paletteClass(primaryAlias));
    expect(warn).not.toHaveBeenCalled();
  } finally {
    warn.mockRestore();
  }
});

test("the autoContrast threshold is the WCAG crossover, where black and white text contrast alike, and its weights are WCAG's", () => {
  const withWhite = 1.05 / (contrastLuminance + 0.05);
  const withBlack = (contrastLuminance + 0.05) / 0.05;

  expect(withWhite).toBeCloseTo(withBlack, 12);
  expect(Object.values(luminanceWeights)).toEqual([0.2126, 0.7152, 0.0722]);
});

test("the colour style props resolve a palette, its shade and the primary the way color does", () => {
  const styleOfBox = (props: Record<string, unknown>) =>
    Object.fromEntries(declarationsIn(valuesOf(rootElementOf(render("Box", props)), "style")[0]));

  expect(styleOfBox({ c: "primary" })).toEqual({ "--sx-c": `var(${primaryProperty("6")})` });
  expect(styleOfBox({ bg: "red.3" })).toEqual({ "--sx-bg": `var(${paletteToken("red", "3")})` });
  expect(styleOfBox({ c: "red-6" })).toEqual({ "--sx-c": `var(${paletteToken("red", "6")})` });
});

const schemes = ["light", "dark"] as const;
type Scheme = (typeof schemes)[number];
type InScheme = (scheme: Scheme) => Oklch;
type Given = { color: string; colour: InScheme; text: InScheme; nine: InScheme };
type Painted = Record<"background" | "hover" | "color" | "border", Oklch>;

const tokens = tokenValues();
const namedColours: Record<string, Oklch> = {
  [textWithoutAPalette]: { lightness: 1, chroma: 0, hue: 0, alpha: 1 },
};
const transparent = "transparent";
const slotOf = {
  background: "--solixc-variant-background",
  hover: "--solixc-variant-hover",
  color: "--solixc-variant-color",
  border: "--solixc-variant-border",
} as const satisfies Record<keyof Painted, string>;
const aliasDeclarations =
  rules.find(
    ({ layers, declarations }) =>
      layers.includes(colorSchemeLayer) && primaryProperty("6") in declarations,
  )?.declarations ?? {};

function oklchOf(written: string): Oklch {
  const colour = parsedOklch(written);
  if (colour === undefined) throw new Error(`${written} is no oklch() colour`);
  return colour;
}

function argumentsOf(inside: string): string[] {
  const found = [""];
  let depth = 0;
  for (const character of inside) {
    depth += character === "(" ? 1 : character === ")" ? -1 : 0;
    if (character === "," && depth === 0) found.push("");
    else found[found.length - 1] += character;
  }
  return found.map((each) => each.trim());
}

function matches(selector: string, classes: string[], variant: string): boolean {
  const match = /^((?:\.[\w-]+)+)(?:\[([\w-]+)="([^"]*)"\])?$/.exec(selector.trim());
  if (!match) throw new Error(`the colour rule ${selector} is no class with an optional attribute`);
  const [, classList, attribute, value] = match;
  return (
    classList
      .split(".")
      .slice(1)
      .every((name) => classes.includes(name)) &&
    (attribute === undefined || (attribute === variantAttribute && value === variant))
  );
}

function declarationsOn(color: string, variant: string): Record<string, string> {
  const props = { color, variant };
  const classes = classesOf(rootOf(props));
  const matched = colourRules.flatMap((rule, order) => {
    const selectors = rule.selector.split(",").filter((each) => matches(each, classes, variant));
    return selectors.length === 0
      ? []
      : [{ rule, order, weight: selectors[0].split(/[.[]/).length }];
  });
  return Object.assign(
    {},
    ...matched
      .toSorted((one, other) => one.weight - other.weight || one.order - other.order)
      .map(({ rule }) => rule.declarations),
    styleOf(props),
  );
}

function evaluated(value: string, on: Record<string, string>, scheme: Scheme): Oklch {
  const written = value.trim();
  if (written === transparent) return transparentOklch;
  if (written in namedColours) return namedColours[written];
  if (written.startsWith("oklch(")) return oklchOf(written);
  const call = /^([\w-]+)\((.*)\)$/.exec(written);
  if (call?.[1] === "var") {
    const name = call[2].trim();
    const declared = on[name] ?? aliasDeclarations[name];
    if (declared !== undefined) return evaluated(declared, on, scheme);
    const token = tokens[name] === undefined ? undefined : schemeValues(tokens[name]);
    if (token === undefined) throw new Error(`nothing sets ${name}`);
    return oklchOf(token[scheme]);
  }
  if (call?.[1] === "color-mix") {
    const [space, first, second] = argumentsOf(call[2]);
    const percent = /^(.*) ([\d.]+)%$/.exec(first);
    if (space !== "in oklab" || !percent) throw new Error(`${written} is no oklab mix`);
    return mixedInOklab(
      evaluated(percent[1], on, scheme),
      Number(percent[2]),
      evaluated(second, on, scheme),
    );
  }
  throw new Error(`${written} is no colour this check reads`);
}

function painted(color: string, variant: string, scheme: Scheme): Painted {
  const on = declarationsOn(color, variant);
  return {
    background: evaluated(on[slotOf.background], on, scheme),
    hover: evaluated(on[slotOf.hover], on, scheme),
    color: evaluated(on[slotOf.color], on, scheme),
    border: evaluated(on[slotOf.border], on, scheme),
  };
}

function tokenIn(name: string, scheme: Scheme): Oklch {
  return evaluated(`var(${name})`, {}, scheme);
}

const documentedMixes: Record<string, (given: Given, scheme: Scheme) => Painted> = {
  filled: (given, scheme) => {
    const text = given.text(scheme);
    const colour = given.colour(scheme);
    return {
      background: colour,
      hover: mixedInOklab(colour, 90, text),
      color: text,
      border: transparentOklch,
    };
  },
  light: (given, scheme) => ({
    background: mixedInOklab(given.colour(scheme), 15, transparentOklch),
    hover: mixedInOklab(given.colour(scheme), 20, transparentOklch),
    color: given.nine(scheme),
    border: transparentOklch,
  }),
  outline: (given, scheme) => ({
    background: transparentOklch,
    hover: mixedInOklab(given.colour(scheme), 5, transparentOklch),
    color: given.colour(scheme),
    border: given.colour(scheme),
  }),
  subtle: (given, scheme) => ({
    background: transparentOklch,
    hover: mixedInOklab(given.colour(scheme), 12, transparentOklch),
    color: given.colour(scheme),
    border: transparentOklch,
  }),
  transparent: (given, scheme) => ({
    background: transparentOklch,
    hover: transparentOklch,
    color: given.colour(scheme),
    border: transparentOklch,
  }),
};

function inOklab(colour: Oklch): number[] {
  return [...oklabOf(colour), colour.alpha].map((channel) => Math.round(channel * 1e6) / 1e6 || 0);
}

function asLab(colours: Painted): Record<string, number[]> {
  return Object.fromEntries(
    Object.entries(colours).map(([slot, colour]) => [slot, inOklab(colour)]),
  );
}

const givenShade = fc
  .constantFrom(
    ...named.flatMap((palette) =>
      shades.map((shade): { palette: Palette; shade: Shade } => ({ palette, shade })),
    ),
  )
  .map(({ palette, shade }): Given => ({
    color: `${palette}.${shade}`,
    colour: (scheme) => tokenIn(shadeSource(palette, shade), scheme),
    text: (scheme) => tokenIn(paletteToken(ownPaletteOf(palette), "contrast"), scheme),
    nine: (scheme) => tokenIn(paletteToken(ownPaletteOf(palette), "9"), scheme),
  }));
const givenCssColour = fc
  .tuple(
    fc.integer({ min: 0, max: 1000 }),
    fc.integer({ min: 0, max: 400 }),
    fc.integer({ min: 0, max: 3599 }),
  )
  .map(([lightness, chroma, hue]): Given => {
    const color = `oklch(${lightness / 1000} ${chroma / 1000} ${hue / 10})`;
    return {
      color,
      colour: () => oklchOf(color),
      text: () => namedColours[textWithoutAPalette],
      nine: (scheme) => mixedInOklab(oklchOf(color), 70, tokenIn("--solix-color-text", scheme)),
    };
  });

test("a given shade or CSS colour is painted with the documented mixes in every variant, filled with its hover 90% toward the text, light at 15% and hovered at 20%, outline hovered at 5%, subtle hovered at 12%, and transparent, in both schemes; its contrast is the consumer's", async (context) => {
  expect(Object.keys(documentedMixes).toSorted()).toEqual(
    variants.filter((variant) => variant !== "default").toSorted(),
  );
  await assertProperty(
    context,
    fc.property(
      fc.oneof(givenShade, givenCssColour),
      fc.constantFrom(...Object.keys(documentedMixes)),
      fc.constantFrom(...schemes),
      (given, variant, scheme) => {
        expect(asLab(painted(given.color, variant, scheme))).toEqual(
          asLab(documentedMixes[variant](given, scheme)),
        );
      },
    ),
  );
});

type Probe<Own> = Own & { class?: string };
type PropsTaken<Own, Options extends PartsOptions<string, Probe<Own>>> = Parameters<
  typeof createParts<string, Record<"root", CompiledStyles>, Probe<Own>, Options>
>[2];

type Listed = "filled" | "light";
type ListedOption = { readonly variants: readonly Listed[]; readonly default: "filled" };

test("createParts refuses, by type, the props of a component that takes ColorProps unless its options give the color option", () => {
  expectTypeOf<Probe<ColorProps<Listed>>>().not.toExtend<
    PropsTaken<ColorProps<Listed>, { keep: [] }>
  >();
  expectTypeOf<Probe<ColorProps<Listed>>>().toExtend<
    PropsTaken<ColorProps<Listed>, { color: ListedOption }>
  >();
  expectTypeOf<Probe<{ label?: string }>>().toExtend<
    PropsTaken<{ label?: string }, { keep: ["label"] }>
  >();
});

test("createParts refuses, by type, a component whose variant takes one its color option does not list, and lets a component without the color option have a variant of its own", () => {
  expectTypeOf<Probe<ColorProps<Listed | "outline">>>().not.toExtend<
    PropsTaken<ColorProps<Listed | "outline">, { color: ListedOption }>
  >();
  expectTypeOf<Probe<{ variant?: "pills" }>>().toExtend<
    PropsTaken<{ variant?: "pills" }, { keep: ["variant"] }>
  >();
});

test("a variant the component's color option does not list falls back to its default", () => {
  const option: ListedOption = { variants: ["filled", "light"], default: "filled" };

  expect(resolveColor(option, { variant: "light" }).attributes).toEqual({
    [variantAttribute]: "light",
  });
  expect(resolveColor(option, { variant: "outline" }).attributes).toEqual({
    [variantAttribute]: "filled",
  });
});

test("SolixColor takes a palette, a palette's shade, a CSS colour keyword, a hex colour and a colour function, and refuses, by type, a typo, a CSS-wide keyword and a name in capitals", () => {
  expectTypeOf<"red">().toExtend<SolixColor>();
  expectTypeOf<"primary.6">().toExtend<SolixColor>();
  expectTypeOf<"rebeccapurple">().toExtend<SolixColor>();
  expectTypeOf<"transparent">().toExtend<SolixColor>();
  expectTypeOf<"currentColor">().toExtend<SolixColor>();
  expectTypeOf<"#0af">().toExtend<SolixColor>();
  expectTypeOf<"oklch(0.5 0.1 20)">().toExtend<SolixColor>();
  expectTypeOf<"var(--brand)">().toExtend<SolixColor>();
  expectTypeOf<"bleu">().not.toExtend<SolixColor>();
  expectTypeOf<"inherit">().not.toExtend<SolixColor>();
  expectTypeOf<"Red">().not.toExtend<SolixColor>();
  expectTypeOf<"red-6">().not.toExtend<SolixColor>();
});
