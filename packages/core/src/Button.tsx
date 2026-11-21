import * as stylex from "@stylexjs/stylex";
import { dynamic, type JSX, type ValidComponent } from "@solidjs/web";
import type { ColorOption, ColorProps } from "#/src/colors.ts";
import { createParts, type PolymorphicProps, withDefaults } from "#/src/parts.ts";
import { buttonVariables } from "#/src/Button.variables.ts";
import type { ScaleValue, VariableProp } from "#/src/style-props.ts";
import { targetSize } from "#/src/target-size.stylex.ts";
import { primaryColors } from "#/src/primary-colors.stylex.ts";
import { tokens } from "#/src/tokens.stylex.ts";
import { variantColors } from "#/src/variant-colors.stylex.ts";

const styles = stylex.create({
  root: {
    "--button-fz": tokens["--solix-font-size-sm"],
    "--button-height": tokens["--solix-control-height-sm"],
    "--button-padding-x": tokens["--solix-control-padding-sm"],
    "--button-radius": tokens["--solix-radius-3xl"],
    backgroundColor: {
      default: variantColors.background,
      ":hover": variantColors.hover,
    },
    borderColor: variantColors.border,
    borderRadius: "var(--button-radius)",
    borderStyle: "solid",
    borderWidth: "0.0625rem",
    color: variantColors.color,
    cursor: "pointer",
    fontSize: "var(--button-fz)",
    fontWeight: 500,
    height: "var(--button-height)",
    minHeight: targetSize.minimum,
    minWidth: targetSize.minimum,
    outlineColor: primaryColors["6"],
    outlineOffset: "0.125rem",
    outlineStyle: {
      default: "none",
      ":focus-visible": "solid",
    },
    outlineWidth: "0.125rem",
    paddingInline: "var(--button-padding-x)",
  },
});

const variantsOfButton = [
  "default",
  "filled",
  "light",
  "outline",
  "subtle",
  "transparent",
] as const;

export type ButtonProps<T extends ValidComponent = "button"> = PolymorphicProps<
  T,
  typeof styles,
  ColorProps<(typeof variantsOfButton)[number]> & {
    /** A key of the `control-height` scale sets its height, padding and font size from their scales; a number of pixels or any CSS length sets all three to that length. */
    size?: VariableProp<typeof buttonVariables, "button-height", ScaleValue<"control-height">>;
    /** Its corner radius: a key of the `radius` scale, a number of pixels or any CSS length. */
    radius?: VariableProp<typeof buttonVariables, "button-radius">;
  }
>;

const unlistedVariant = "filled";
const defaults = { component: "button", variant: unlistedVariant } satisfies Partial<ButtonProps>;

export function Button<T extends ValidComponent = "button">(props: ButtonProps<T>): JSX.Element;
export function Button(props: ButtonProps): JSX.Element;
export function Button<T extends ValidComponent = "button">(rawProps: ButtonProps<T>) {
  const props = withDefaults(defaults, rawProps);
  const { root } = createParts(buttonVariables, styles, props, {
    variables: {
      "button-fz": "size",
      "button-height": "size",
      "button-padding-x": "size",
      "button-radius": "radius",
    },
    color: { variants: variantsOfButton, default: unlistedVariant } satisfies ColorOption,
  });
  const Root = dynamic(() => props.component);
  return <Root {...root} />;
}
