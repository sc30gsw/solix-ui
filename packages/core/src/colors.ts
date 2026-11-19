import {
  autoContrastClass,
  colorClass,
  colorProperty,
  type ColorVariant,
  customColorClass,
  isPalette,
  isShade,
  ownPaletteOf,
  type Palette,
  paletteClass,
  paletteToken,
  primaryAlias,
  primaryProperty,
  type Shade,
  shadeClass,
  variantAttribute,
} from "#/src/color-table.ts";
import { characterThatEndsADeclaration, type ResolvedStyleProps } from "#/src/style-props.ts";

export type SolixColor = Palette | `${Palette}.${Shade}` | (string & {});

export type ColorProps = {
  color?: SolixColor;
  variant?: ColorVariant;
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

export type ResolvedColor = ResolvedStyleProps & {
  readonly attributes: Readonly<Partial<Record<typeof variantAttribute, string>>>;
};

const shadeSeparator = ".";
const defaultPalette = primaryAlias satisfies Palette;

function shadeOf(palette: Palette, shade: Shade): string {
  return palette === primaryAlias
    ? `var(${primaryProperty(shade)})`
    : `var(${paletteToken(ownPaletteOf(palette), shade)})`;
}

function given(color: unknown): ResolvedStyleProps {
  if (typeof color !== "string" || characterThatEndsADeclaration.test(color)) {
    return { classes: [colorClass, paletteClass(defaultPalette)], properties: {} };
  }
  if (isPalette(color)) return { classes: [colorClass, paletteClass(color)], properties: {} };
  const at = color.lastIndexOf(shadeSeparator);
  const palette = color.slice(0, at);
  const shade = color.slice(at + 1);
  if (at > 0 && isPalette(palette) && isShade(shade)) {
    return {
      classes: [colorClass, paletteClass(palette), shadeClass],
      properties: { [colorProperty]: shadeOf(palette, shade) },
    };
  }
  return {
    classes: [colorClass, shadeClass, customColorClass],
    properties: { [colorProperty]: color },
  };
}

export function resolveColor(
  defaultVariant: ColorVariant,
  props: Readonly<Record<string, unknown>>,
): ResolvedColor {
  const resolved = given(props.color);
  return {
    classes:
      props.autoContrast === true ? [...resolved.classes, autoContrastClass] : resolved.classes,
    properties: resolved.properties,
    attributes: {
      [variantAttribute]: typeof props.variant === "string" ? props.variant : defaultVariant,
    },
  };
}

export function colorResolver(
  defaultVariant: ColorVariant,
  props: Readonly<Record<string, unknown>>,
): { readonly keys: readonly ColorPropKey[]; readonly resolved: () => ResolvedColor } {
  return { keys: colorPropKeys, resolved: () => resolveColor(defaultVariant, props) };
}
