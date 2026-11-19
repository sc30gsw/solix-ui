import {
  colorClass,
  colorProperty,
  type ColorVariant,
  customColorClass,
  defaultPalette,
  fixedContrastClass,
  type Palette,
  paletteClass,
  palettesIn,
  paletteToken,
  type Shade,
  shadeClass,
} from "#/src/style-prop-table.ts";
import { characterThatEndsADeclaration, type ResolvedStyleProps } from "#/src/style-props.ts";
import { tokens } from "#/src/tokens.stylex.ts";

export type SolixColor = Palette | `${Palette}.${Shade}` | (string & {});

export type ColorProps<Variant extends string = ColorVariant> = {
  color?: SolixColor;
  variant?: Variant | (string & {});
  autoContrast?: boolean;
};

export type ColorPropKey = keyof ColorProps;

const colorProps = { color: true, variant: true, autoContrast: true } satisfies Record<
  ColorPropKey,
  true
>;

function isColorPropKey(name: PropertyKey): name is ColorPropKey {
  return Object.hasOwn(colorProps, name);
}

export const colorPropKeys = Object.keys(colorProps).filter(isColorPropKey);

const { palettes, shades } = palettesIn(Object.keys(tokens));
const shadeSeparator = ".";

function named(color: string): string[] {
  return [colorClass, paletteClass(color)];
}

function given(color: unknown): ResolvedStyleProps {
  if (typeof color !== "string" || characterThatEndsADeclaration.test(color)) {
    return { classes: named(defaultPalette), properties: {} };
  }
  if (palettes.includes(color)) return { classes: named(color), properties: {} };
  const at = color.lastIndexOf(shadeSeparator);
  const palette = color.slice(0, at);
  const shade = color.slice(at + 1);
  if (at > 0 && palettes.includes(palette) && shades.includes(shade)) {
    return {
      classes: [...named(palette), shadeClass],
      properties: { [colorProperty]: `var(${paletteToken(palette, shade)})` },
    };
  }
  return {
    classes: [colorClass, shadeClass, customColorClass],
    properties: { [colorProperty]: color },
  };
}

export function resolveColor(color: unknown, autoContrast: unknown): ResolvedStyleProps {
  const resolved = given(color);
  return autoContrast === false
    ? { ...resolved, classes: [...resolved.classes, fixedContrastClass] }
    : resolved;
}
