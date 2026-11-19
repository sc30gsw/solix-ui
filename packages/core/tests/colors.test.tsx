import fc from "fast-check";
import postcss from "postcss";
import { expect, test } from "vite-plus/test";
import { LIBRARY_CASCADE_LAYER } from "#/build-pipeline.mjs";
import {
  autoContrastClass,
  colorClass,
  colorClassPrefix,
  colorLayer,
  colorProperty,
  colorVariantTable,
  customColorClass,
  ownPaletteOf,
  type Palette,
  paletteAliases,
  paletteClass,
  palettes,
  paletteToken,
  primaryAlias,
  primaryPalette,
  primaryProperty,
  shadeClass,
  shades,
  slotDefaults,
  tintShades,
  contrastLuminance,
  luminanceWeights,
  variantAttribute,
} from "#/src/color-table.ts";
import { colorSchemeLayer, componentLayer } from "#/src/style-prop-table.ts";
import { stylesheet } from "#/tests/built-library.ts";
import { layersAround } from "#/tests/cascade-layers.ts";
import { render } from "#/tests/fixtures.ts";
import { classesOf, declarationsIn, rootElementOf, valuesOf } from "#/tests/markup.ts";
import { assertProperty } from "../../../tests/support/properties.ts";
import { tokenKind, tokenValues } from "../../../scripts/tokens";

const named: Palette[] = [
  ...palettes,
  ...Object.keys(paletteAliases).filter((name): name is keyof typeof paletteAliases =>
    Object.hasOwn(paletteAliases, name),
  ),
];
const variants = Object.keys(colorVariantTable);
const slots = Object.keys(colorVariantTable.default.named);

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
    [...palettes, ...Object.keys(paletteAliases)].some((palette) =>
      name.startsWith(`--solix-color-${palette}-`),
    );

  expect(colourTokens.filter(ofAPalette).toSorted()).toEqual(
    palettes.flatMap((palette) => shades.map((shade) => paletteToken(palette, shade))).toSorted(),
  );
});

test("every rule of the colours layer, the first layer inside components, selects a class with the colours' own prefix and sets custom properties only", () => {
  const [first] =
    postcss
      .parse(stylesheet)
      .nodes.flatMap((node) => (node.type === "atrule" ? (node.nodes ?? []) : []))
      .flatMap((node) =>
        node.type === "atrule" && node.params === componentLayer ? (node.nodes ?? []) : [],
      ) ?? [];

  expect(first?.type === "atrule" && first.params).toBe(colorLayer);
  expect(colourRules.length).toBeGreaterThan(0);
  expect(
    colourRules.filter(
      ({ selector, declarations, layers }) =>
        !selector.startsWith(`.${colorClassPrefix}`) ||
        Object.keys(declarations).some((property) => !property.startsWith("--")) ||
        layers.join(" ") !== [colorLayer, componentLayer, LIBRARY_CASCADE_LAYER].join(" "),
    ),
  ).toEqual([]);
});

test.each(named)(
  "the class of %s sets every shade from its own palette's tokens, or for the primary from the primary's alias",
  (palette) => {
    const source = (shade: (typeof shades)[number]) =>
      palette === primaryAlias
        ? `var(${primaryProperty(shade)})`
        : `var(${paletteToken(ownPaletteOf(palette), shade)})`;

    expect(Object.values(ruleFor(`.${paletteClass(palette)}`))).toEqual(shades.map(source));
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
  expect(reset["--sx-variant-hover"]).toBe("var(--sx-variant-background)");
  expect(valuesOf(rootOf({ variant: "nonsense" }), variantAttribute)).toEqual(["filled"]);
});

test.each(variants)(
  "the variant %s sets every slot for a palette, and for a given shade or colour reads that colour",
  (variant) => {
    const forAPalette = ruleFor(`.${colorClass}[${variantAttribute}="${variant}"]`);
    const forAShade = ruleFor(`.${shadeClass}[${variantAttribute}="${variant}"]`);
    const givenSlots = Object.entries(
      colorVariantTable[variant as keyof typeof colorVariantTable].given,
    )
      .filter(([, value]) => value.startsWith("given"))
      .map(([slot]) => slot);

    expect(Object.keys(forAPalette)).toEqual(slots);
    expect(Object.keys(forAShade)).toEqual(slots);
    expect(
      givenSlots.filter((slot) => !forAShade[slot]?.includes(`var(${colorProperty})`)),
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
        [colorProperty]:
          palette === primaryAlias
            ? `var(${primaryProperty(shade)})`
            : `var(${paletteToken(ownPaletteOf(palette), shade)})`,
      });
    }
  }
});

test("autoContrast is off unless it is true: only then does the root take the class that computes the text from the solid shade", () => {
  expect(classesOf(rootOf({}))).not.toContain(autoContrastClass);
  expect(classesOf(rootOf({ autoContrast: false }))).not.toContain(autoContrastClass);
  expect(classesOf(rootOf({ autoContrast: true }))).toContain(autoContrastClass);
  expect(Object.keys(ruleFor(`.${shadeClass}`))).not.toContain("--sxc-shade-contrast");
});

test("any other CSS colour writes one custom property, itself, with the shade and custom classes, and a value that is no colour, such as red-6, blue.12 or one that holds ;, { or }, falls back to the primary palette and writes nothing", async (context) => {
  await assertProperty(
    context,
    fc.property(
      fc.oneof(
        fc.stringMatching(/^#[0-9a-f]{6}$/).map((color) => ({ color, valid: true })),
        fc
          .constantFrom("oklch(0.5 0.1 20)", "rgb(10 20 30)", "transparent", "rebeccapurple")
          .map((color) => ({ color, valid: true })),
        fc
          .constantFrom("red-6", "blue.12", "#f00;", "red}", "a{b")
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

test("a given shade or colour tints the light variant from shades 1 and 2, which the shade class mixes from it, and never paints it solid", () => {
  const light = ruleFor(`.${shadeClass}[${variantAttribute}="light"]`);
  const shade = ruleFor(`.${shadeClass}`);

  expect(light["--sx-variant-background"]).toBe("var(--sxc-shade-1)");
  expect(light["--sx-variant-hover"]).toBe("var(--sxc-shade-2)");
  expect(Object.keys(tintShades).map((name) => shade[`--sxc-shade-${name}`])).toEqual(
    Object.values(tintShades).map(
      ([percent, toward]) => `color-mix(in oklab, var(${colorProperty}) ${percent}%, ${toward})`,
    ),
  );
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
