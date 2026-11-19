import {
  autoContrastClass,
  colorClass,
  colorProperty,
  type ColorVariant,
  customColorClass,
  isColorVariant,
  type Palette,
  paletteClass,
  parseColor,
  primaryAlias,
  type Shade,
  shadeClass,
  variantAttribute,
} from "#/src/color-table.ts";
import type { ResolvedStyleProps } from "#/src/style-props.ts";

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

const defaultPalette = primaryAlias satisfies Palette;

function given(color: unknown): ResolvedStyleProps {
  const parsed = parseColor(color);
  if (parsed === undefined) {
    return { classes: [colorClass, paletteClass(defaultPalette)], properties: {} };
  }
  if (parsed.kind === "palette") {
    return { classes: [colorClass, paletteClass(parsed.palette)], properties: {} };
  }
  return {
    classes:
      parsed.kind === "shade"
        ? [colorClass, paletteClass(parsed.palette), shadeClass]
        : [colorClass, shadeClass, customColorClass],
    properties: { [colorProperty]: parsed.value },
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
      [variantAttribute]: isColorVariant(props.variant) ? props.variant : defaultVariant,
    },
  };
}

export function colorResolver(
  defaultVariant: ColorVariant,
  props: Readonly<Record<string, unknown>>,
): { readonly keys: readonly ColorPropKey[]; readonly resolved: () => ResolvedColor } {
  return { keys: colorPropKeys, resolved: () => resolveColor(defaultVariant, props) };
}
