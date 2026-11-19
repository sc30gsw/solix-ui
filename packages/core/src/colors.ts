import {
  autoContrastClass,
  colorClass,
  colorProperty,
  type ColorVariant,
  customColorClass,
  type Palette,
  paletteClass,
  parseColor,
  primaryName,
  type Shade,
  shadeClass,
  variantAttribute,
} from "#/src/color-table.ts";
import { createMemo } from "solid-js";
import type { CssColorFunction, CssColorKeyword } from "#/src/css-colors.ts";
import { warnInTheBrowserDuringDevelopment } from "#/src/development-warning.ts";
import type { Resolved, Resolver } from "#/src/style-props.ts";

export type SolixColor =
  | Palette
  | `${Palette}.${Shade}`
  | CssColorKeyword
  | `#${string}`
  | `${CssColorFunction}(${string})`;

export type ColorProps<Variant extends ColorVariant> = {
  color?: SolixColor;
  variant?: Variant;
  autoContrast?: boolean;
};

export type ColorOption<Variant extends ColorVariant = ColorVariant> = {
  readonly variants: readonly Variant[];
  readonly default: NoInfer<Variant>;
};

export type ColorPropKey = keyof ColorProps<ColorVariant>;

const colorProps = { color: true, variant: true, autoContrast: true } satisfies Record<
  ColorPropKey,
  true
>;

function isColorPropKey(name: PropertyKey): name is ColorPropKey {
  return Object.hasOwn(colorProps, name);
}

export const colorPropKeys = Object.keys(colorProps).filter(isColorPropKey);

const defaultPalette = primaryName satisfies Palette;

function classesOf(color: unknown): Omit<Resolved, "attributes"> {
  const parsed = parseColor(color);
  if (parsed === undefined) {
    if (color !== undefined) {
      warnInTheBrowserDuringDevelopment(
        () =>
          `color=${JSON.stringify(color)} is neither a palette, a palette's shade such as "red.6", nor a CSS colour, so the component takes the ${defaultPalette} palette.`,
      );
    }
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
  option: ColorOption,
  props: Readonly<Record<string, unknown>>,
): Resolved {
  const resolved = classesOf(props.color);
  return {
    classes:
      props.autoContrast === true ? [...resolved.classes, autoContrastClass] : resolved.classes,
    properties: resolved.properties,
    attributes: {
      [variantAttribute]:
        option.variants.find((variant) => variant === props.variant) ?? option.default,
    },
  };
}

export function colorResolver(
  option: ColorOption,
  props: Readonly<Record<string, unknown>>,
): Resolver {
  return { keys: colorPropKeys, resolved: createMemo(() => resolveColor(option, props)) };
}
