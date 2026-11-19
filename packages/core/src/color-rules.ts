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
  type VariantRow,
} from "#/src/color-table.ts";

const given = `var(${colorProperty})`;
const contrast = `var(${shadeProperty(contrastShade)})`;
const solidShade = "6" satisfies Shade;
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
  if (value === "given") return given;
  if (value === "given-hover") return mixed(given, 90, contrast);
  const alpha = /^given\/(\d+)$/.exec(value)?.[1];
  if (alpha !== undefined) return mixed(given, Number(alpha), "transparent");
  return value.startsWith("--") ? `var(${value})` : `var(${shadeProperty(value)})`;
}

function variantRule(selector: string, slots: VariantRow["named"] | VariantRow["given"]): string {
  return `${selector}{${declared(Object.entries(slots).map(([slot, value]) => [slot, slotValue(value)]))}}`;
}

export function colorRules(): string {
  const variants = Object.entries(colorVariantTable);
  const slots = Object.keys(colorVariantTable.default.named);
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
    `.${shadeClass}{${declared([[shadeProperty(solidShade), given]])}}`,
    `.${customColorClass}{${declared([
      ...Object.entries(derivedShades).map(([shade, [percent, toward]]): [string, string] => [
        shadeProperty(shade),
        mixed(given, percent, toward),
      ]),
      [shadeProperty(contrastShade), textWithoutAPalette],
    ])}}`,
    `.${autoContrastClass}{${declared([[shadeProperty(contrastShade), contrastingText(`var(${shadeProperty(solidShade)})`)]])}}`,
    `.${colorClass}{${declared(slots.map((slot) => [slot, "initial"]))}}`,
    ...variants.map(([variant, row]) =>
      variantRule(`.${colorClass}[${variantAttribute}="${variant}"]`, row.named),
    ),
    ...variants.map(([variant, row]) =>
      variantRule(`.${shadeClass}[${variantAttribute}="${variant}"]`, row.given),
    ),
  ];
  return `@layer ${colorLayer}{\n${rules.join("\n")}\n}`;
}

export function primaryRule(): string {
  return `${schemeRoots}{${declared(
    shades.map((shade) => [primaryProperty(shade), `var(${paletteToken(primaryPalette, shade)})`]),
  )}}`;
}
