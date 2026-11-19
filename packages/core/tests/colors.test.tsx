import fc from "fast-check";
import postcss from "postcss";
import { expect, test } from "vite-plus/test";
import { LIBRARY_CASCADE_LAYER } from "#/build-pipeline.mjs";
import {
  colorClass,
  colorLayer,
  colorProperty,
  colorVariantTable,
  customColorClass,
  defaultPalette,
  fixedContrastClass,
  paletteClass,
  palettes,
  paletteToken,
  shadeClass,
  shadeProperty,
  shades,
  variantAttribute,
} from "#/src/color-table.ts";
import { componentLayer } from "#/src/style-prop-table.ts";
import { stylesheet } from "#/tests/built-library.ts";
import { layersAround } from "#/tests/cascade-layers.ts";
import { render } from "#/tests/fixtures.ts";
import { classesOf, declarationsIn, rootElementOf, valuesOf } from "#/tests/markup.ts";
import { assertProperty } from "../../../tests/support/properties.ts";
import { tokenKind, tokenValues } from "../../../scripts/tokens";

const variants = Object.keys(colorVariantTable);

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

function rootOf(props: Record<string, unknown>) {
  return rootElementOf(render("Button", props));
}

function styleOf(props: Record<string, unknown>): Record<string, string> {
  return Object.fromEntries(declarationsIn(valuesOf(rootOf(props), "style")[0]));
}

function variantOf(props: Record<string, unknown>): unknown {
  return valuesOf(rootOf(props), variantAttribute)[0];
}

test("the colour tokens hold exactly one token for each shade of each palette of the colour table", () => {
  const colourTokens = Object.keys(tokenValues()).filter((name) => tokenKind(name) === "colour");
  const ofAPalette = (name: string) =>
    palettes.some((palette) => name.startsWith(`--solix-color-${palette}-`));

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
    ...palettes.map((palette) => `.${paletteClass(palette)}`),
    `.${shadeClass}`,
    `.${customColorClass}`,
    `.${fixedContrastClass}`,
    ...variants.map((variant) => `.${colorClass}[${variantAttribute}="${variant}"]`),
  ]);
  expect(rules.slice(0, palettes.length).map(({ properties }) => properties)).toEqual(
    palettes.map(() => shadeProperties),
  );
  expect(rules.slice(-variants.length).map(({ properties }) => properties)).toEqual(
    Object.values(colorVariantTable).map((slots) => Object.keys(slots)),
  );
});

test.each(palettes)(
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
    expect.arrayContaining([colorClass, paletteClass(defaultPalette)]),
  );
  expect(styleOf({})).toEqual({});
  expect(variantOf({})).toBe("filled");
});

test("a shade of a palette gives the palette's class and the shade class, and writes one custom property, the shade's token", () => {
  for (const palette of palettes) {
    for (const shade of shades) {
      const color = `${palette}.${shade}`;
      expect(classesOf(rootOf({ color }))).toEqual(
        expect.arrayContaining([colorClass, paletteClass(palette), shadeClass]),
      );
      expect(styleOf({ color })).toEqual({
        [colorProperty]: `var(${paletteToken(palette, shade)})`,
      });
    }
  }
});

test("any other colour writes one custom property, itself, with the shade and custom classes; one that holds ;, { or } is dropped for the primary palette; a variant and autoContrast={false} reach the root", async (context) => {
  const named = new Set([
    ...palettes,
    ...palettes.flatMap((palette) => shades.map((shade) => `${palette}.${shade}`)),
  ]);
  await assertProperty(
    context,
    fc.property(
      fc
        .string({
          unit: fc.constantFrom(..."abcdefor0123456789#(),.% ;{}".split("")),
          minLength: 1,
        })
        .filter((color) => color.trim() === color && !named.has(color)),
      fc.string({ minLength: 1 }).filter((variant) => /^[\w-]+$/.test(variant)),
      fc.boolean(),
      (color, variant, autoContrast) => {
        const props = { color, variant, autoContrast };
        const classes = classesOf(rootOf(props));
        const dropped = /[;{}]/.test(color);

        expect(variantOf(props)).toBe(variant);
        expect(classes.includes(fixedContrastClass)).toBe(!autoContrast);
        if (dropped) {
          expect(classes).toEqual(
            expect.arrayContaining([colorClass, paletteClass(defaultPalette)]),
          );
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
