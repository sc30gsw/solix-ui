import {
  autoContrastClass,
  colorClass,
  colorLayer,
  colorProperty,
  colorVariantTable,
  contrastLuminance,
  contrastShade,
  customColorClass,
  derivedShades,
  type OwnPalette,
  paletteAliases,
  paletteClass,
  palettes,
  paletteToken,
  primaryAlias,
  primaryPalette,
  primaryProperty,
  type Shade,
  shadeClass,
  shadeProperty,
  shades,
  textWithoutAPalette,
  variantAttribute,
} from "#/src/color-table.ts";

const given = `var(${colorProperty})`;
const contrast = `var(${shadeProperty(contrastShade)})`;
const solidShade = "6" satisfies Shade;
const hoverShade = "7" satisfies Shade;
const schemeRoots = ":root,[data-color-scheme]";

export function contrastingText(colour: string): string {
  const channel = `clamp(0, (${contrastLuminance} - (0.2126 * r + 0.7152 * g + 0.0722 * b)) * 1000000, 1)`;
  return `color(from ${colour} srgb-linear ${channel} ${channel} ${channel})`;
}

function mixed(colour: string, percent: number, toward: string): string {
  return `color-mix(in oklab, ${colour} ${percent}%, ${toward})`;
}

function declared(declarations: readonly (readonly [string, string])[]): string {
  return declarations.map(([property, value]) => `${property}:${value}`).join(";");
}

function shadesFrom(source: (shade: Shade) => string): string {
  return declared(shades.map((shade) => [shadeProperty(shade), `var(${source(shade)})`]));
}

function slotValue(value: string): string {
  if (value === "transparent") return value;
  return value.startsWith("--") ? `var(${value})` : `var(${shadeProperty(value)})`;
}

export function colorRules(): string {
  const rules = [
    ...palettes.map(
      (palette) =>
        `.${paletteClass(palette)}{${shadesFrom((shade) => paletteToken(palette, shade))}}`,
    ),
    `.${paletteClass(primaryAlias)}{${shadesFrom(primaryProperty)}}`,
    ...Object.entries(paletteAliases)
      .filter(([alias]) => alias !== primaryAlias)
      .map(
        ([alias, palette]: [string, OwnPalette]) =>
          `.${paletteClass(alias)}{${shadesFrom((shade) => paletteToken(palette, shade))}}`,
      ),
    `.${shadeClass}{${declared([
      [shadeProperty(solidShade), given],
      [shadeProperty(hoverShade), mixed(given, 90, contrast)],
    ])}}`,
    `.${customColorClass}{${declared([
      ...Object.entries(derivedShades).map(([shade, [percent, toward]]): [string, string] => [
        shadeProperty(shade),
        mixed(given, percent, toward),
      ]),
      [shadeProperty(contrastShade), textWithoutAPalette],
    ])}}`,
    `.${autoContrastClass}{${declared([[shadeProperty(contrastShade), contrastingText(`var(${shadeProperty(solidShade)})`)]])}}`,
    ...Object.entries(colorVariantTable).map(
      ([variant, slots]) =>
        `.${colorClass}[${variantAttribute}="${variant}"]{${declared(
          Object.entries(slots).map(([slot, value]) => [slot, slotValue(value)]),
        )}}`,
    ),
  ];
  return `@layer ${colorLayer}{\n${rules.join("\n")}\n}`;
}

export function primaryRule(): string {
  return `${schemeRoots}{${declared(
    shades.map((shade) => [primaryProperty(shade), `var(${paletteToken(primaryPalette, shade)})`]),
  )}}`;
}
