import fc from "fast-check";
import postcss from "postcss";
import { expect, test } from "vite-plus/test";
import { LIBRARY_CASCADE_LAYER } from "#/build-pipeline.mjs";
import {
  autoContrastClass,
  colorClass,
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
  shadeProperty,
  shades,
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

function shadeOf(palette: Palette, shade: (typeof shades)[number]): string {
  return palette === primaryAlias
    ? `var(${primaryProperty(shade)})`
    : `var(${paletteToken(ownPaletteOf(palette), shade)})`;
}

type Placed = { selector: string; properties: string[]; layers: string[] };

function colourLayerRules(): { rules: Placed[]; firstInComponents: boolean } {
  const rules: Placed[] = [];
  let firstInComponents = false;
  postcss.parse(stylesheet).walkAtRules("layer", (layer) => {
    if (layer.params === componentLayer && layer.parent?.type === "atrule") {
      const [first] = layer.nodes ?? [];
      firstInComponents =
        first?.type === "atrule" && first.name === "layer" && first.params === colorLayer;
    }
    if (layer.params !== colorLayer) return;
    layer.walkRules((rule) => {
      rules.push({
        selector: rule.selector,
        properties: rule.nodes.flatMap((node) => (node.type === "decl" ? [node.prop] : [])),
        layers: layersAround(rule),
      });
    });
  });
  return { rules, firstInComponents };
}

function declaredBy(selector: string): [string, string][] {
  const found: [string, string][] = [];
  postcss.parse(stylesheet).walkRules((rule) => {
    if (rule.selector !== selector) return;
    for (const node of rule.nodes) if (node.type === "decl") found.push([node.prop, node.value]);
  });
  return found;
}

function rootOf(props: Record<string, unknown>) {
  return rootElementOf(render("Button", props));
}

function styleOf(props: Record<string, unknown>): Record<string, string> {
  return Object.fromEntries(declarationsIn(valuesOf(rootOf(props), "style")[0]));
}

function variantOf(props: Record<string, unknown>): unknown {
  return valuesOf(rootOf(props), variantAttribute)[0];
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

test("the colours layer is the first layer inside the components layer, and holds one class per palette that sets every shade, then the shade, custom and fixed-contrast classes, then one rule per variant of the table on data-variant, which sets every slot, and nothing else", () => {
  const { rules, firstInComponents } = colourLayerRules();
  const shadeProperties = shades.map(shadeProperty);

  expect(firstInComponents).toBe(true);
  expect(
    rules.filter(
      ({ layers }) =>
        layers.join(" ") !== [colorLayer, componentLayer, LIBRARY_CASCADE_LAYER].join(" "),
    ),
  ).toEqual([]);
  expect(rules.map(({ selector }) => selector)).toEqual([
    ...named.map((palette) => `.${paletteClass(palette)}`),
    `.${shadeClass}`,
    `.${customColorClass}`,
    `.${autoContrastClass}`,
    ...variants.map((variant) => `.${colorClass}[${variantAttribute}="${variant}"]`),
  ]);
  expect(rules.slice(0, named.length).map(({ properties }) => properties)).toEqual(
    named.map(() => shadeProperties),
  );
  expect(rules.slice(-variants.length).map(({ properties }) => properties)).toEqual(
    Object.values(colorVariantTable).map((slots) => Object.keys(slots)),
  );
});

test.each(named)(
  "naming the palette %s gives the root its class and writes no custom property",
  (palette) => {
    expect(classesOf(rootOf({ color: palette }))).toEqual(
      expect.arrayContaining([colorClass, paletteClass(palette)]),
    );
    expect(styleOf({ color: palette })).toEqual({});
  },
);

test("with no color the root takes the primary palette, writes no custom property, and takes the component's default variant", () => {
  expect(classesOf(rootOf({}))).toEqual(
    expect.arrayContaining([colorClass, paletteClass(primaryAlias)]),
  );
  expect(styleOf({})).toEqual({});
  expect(variantOf({})).toBe("filled");
});

test("a shade of a palette gives the palette's class and the shade class, and writes one custom property, the shade, through the primary's alias for the primary", () => {
  for (const palette of named) {
    for (const shade of shades) {
      const color = `${palette}.${shade}`;
      expect(classesOf(rootOf({ color }))).toEqual(
        expect.arrayContaining([colorClass, paletteClass(palette), shadeClass]),
      );
      expect(styleOf({ color })).toEqual({
        [colorProperty]: shadeOf(palette, shade),
      });
    }
  }
});

test("any other colour writes one custom property, itself, with the shade and custom classes; one that holds ;, { or } is dropped for the primary palette; a variant and autoContrast reach the root", async (context) => {
  const known = new Set<string>([
    ...named,
    ...named.flatMap((palette) => shades.map((shade) => `${palette}.${shade}`)),
  ]);
  await assertProperty(
    context,
    fc.property(
      fc
        .string({
          unit: fc.constantFrom(..."abcdefor0123456789#(),.% ;{}".split("")),
          minLength: 1,
        })
        .filter((color) => color.trim() === color && !known.has(color)),
      fc.string({ minLength: 1 }).filter((variant) => /^[\w-]+$/.test(variant)),
      fc.boolean(),
      (color, variant, autoContrast) => {
        const props = { color, variant, autoContrast };
        const classes = classesOf(rootOf(props));
        const dropped = /[;{}]/.test(color);

        expect(variantOf(props)).toBe(variant);
        expect(classes.includes(autoContrastClass)).toBe(autoContrast);
        if (dropped) {
          expect(classes).toEqual(expect.arrayContaining([colorClass, paletteClass(primaryAlias)]));
          expect(styleOf(props)).toEqual({});
        } else {
          expect(classes).toEqual(
            expect.arrayContaining([colorClass, shadeClass, customColorClass]),
          );
          expect(Object.keys(styleOf(props))).toEqual([colorProperty]);
        }
      },
    ),
  );
});

test.each(named)(
  "the class of %s sets every shade from its own palette's tokens, or for the primary from the primary's alias",
  (palette) => {
    expect(declaredBy(`.${paletteClass(palette)}`)).toEqual(
      shades.map((shade) => [shadeProperty(shade), shadeOf(palette, shade)]),
    );
  },
);

test("the primary's alias is written once, on :root and on every element with a colour scheme, from the primary palette's tokens", () => {
  const aliases: { selector: string; declarations: [string, string][] }[] = [];
  postcss.parse(stylesheet).walkRules((rule) => {
    const declarations = rule.nodes.flatMap((node): [string, string][] =>
      node.type === "decl" ? [[node.prop, node.value]] : [],
    );
    if (
      layersAround(rule).includes(colorSchemeLayer) &&
      declarations.some(([property]) => property === primaryProperty("6"))
    ) {
      aliases.push({ selector: rule.selector, declarations });
    }
  });

  expect(aliases.map(({ selector }) => selector)).toEqual([":root,[data-color-scheme]"]);
  expect(aliases[0]?.declarations).toEqual(
    shades.map((shade) => [primaryProperty(shade), `var(${paletteToken(primaryPalette, shade)})`]),
  );
});

test("autoContrast is off unless it is true: only then does the root take the class that computes the text from the solid shade", () => {
  expect(classesOf(rootOf({}))).not.toContain(autoContrastClass);
  expect(classesOf(rootOf({ autoContrast: false }))).not.toContain(autoContrastClass);
  expect(classesOf(rootOf({ autoContrast: true }))).toContain(autoContrastClass);
  expect(declaredBy(`.${shadeClass}`).map(([property]) => property)).not.toContain(
    shadeProperty("contrast"),
  );
});
