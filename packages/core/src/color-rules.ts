import {
  autoContrastClass,
  colorClass,
  colorProperty,
  colorVariantTable,
  contrastLuminance,
  luminanceWeights,
  shadeSource,
  slotDefaults,
  tintShades,
  contrastShade,
  customColorClass,
  derivedShades,
  namedPalettes,
  paletteClass,
  paletteToken,
  primaryName,
  primaryPalette,
  type ColorSlotValue,
  type Mix,
  type Shade,
  shadeClass,
  shadeProperty,
  shades,
  textWithoutAPalette,
  variantAttribute,
  type VariantRow,
  writtenColor,
} from "#/src/color-table.ts";

const theColor = `var(${colorProperty})`;
const solidShade = "6" satisfies Shade;
const schemeRoots = ":root,[data-color-scheme]";

export function contrastingText(colour: string): string {
  const { r, g, b } = luminanceWeights;
  const channel = `clamp(0, (${contrastLuminance} - (${r} * r + ${g} * g + ${b} * b)) * 1000000, 1)`;
  return `color(from ${colour} srgb-linear ${channel} ${channel} ${channel})`;
}

function mixed([percent, toward]: Mix): string {
  return `color-mix(in oklab, ${theColor} ${percent}%, ${slotValue(toward)})`;
}

function declared(declarations: readonly (readonly [string, string])[]): string {
  return declarations.map(([property, value]) => `${property}:${value}`).join(";");
}

function shadesFrom(source: (shade: Shade) => string): string {
  return declared(shades.map((shade) => [shadeProperty(shade), `var(${source(shade)})`]));
}

function slotValue(value: ColorSlotValue): string {
  if (typeof value !== "string") return mixed(value);
  if (value === "transparent") return value;
  if (value === writtenColor) return theColor;
  return value.startsWith("--") ? `var(${value})` : `var(${shadeProperty(value)})`;
}

function variantRule(selector: string, slots: VariantRow[keyof VariantRow]): string {
  return `${selector}{${declared(Object.entries(slots).map(([slot, value]) => [slot, slotValue(value)]))}}`;
}

export function colorRules(): string {
  const variants = Object.entries(colorVariantTable);
  const rules = [
    ...namedPalettes.map(
      (palette) =>
        `.${paletteClass(palette)}{${shadesFrom((shade) => shadeSource(palette, shade))}}`,
    ),
    `.${shadeClass}{${declared([
      [shadeProperty(solidShade), theColor],
      ...Object.entries(tintShades).map(([shade, mix]): [string, string] => [
        shadeProperty(shade),
        mixed(mix),
      ]),
    ])}}`,
    `.${customColorClass}{${declared([
      ...Object.entries(derivedShades).map(([shade, mix]): [string, string] => [
        shadeProperty(shade),
        mixed(mix),
      ]),
      [shadeProperty(contrastShade), textWithoutAPalette],
    ])}}`,
    `.${autoContrastClass}{${declared([[shadeProperty(contrastShade), contrastingText(`var(${shadeProperty(solidShade)})`)]])}}`,
    `.${colorClass}{${declared(Object.entries(slotDefaults))}}`,
    ...variants.map(([variant, row]) =>
      variantRule(`.${colorClass}[${variantAttribute}="${variant}"]`, row.palette),
    ),
    ...variants.map(([variant, row]) =>
      variantRule(`.${shadeClass}[${variantAttribute}="${variant}"]`, row.color),
    ),
  ];
  return rules.join("\n");
}

export function primaryRule(): string {
  return `${schemeRoots}{${declared(
    shades.map((shade) => [
      paletteToken(primaryName, shade),
      `var(${paletteToken(primaryPalette, shade)})`,
    ]),
  )}}`;
}
