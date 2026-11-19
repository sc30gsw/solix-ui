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

const defaultPalette = primaryAlias satisfies Palette;

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
  defaultVariant: ColorVariant,
  props: Readonly<Record<string, unknown>>,
): Resolved {
  const resolved = classesOf(props.color);
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
): Resolver {
  return { keys: colorPropKeys, resolved: createMemo(() => resolveColor(defaultVariant, props)) };
}
