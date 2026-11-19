import * as stylex from "@stylexjs/stylex";
import { dynamic, type JSX, type ValidComponent } from "@solidjs/web";
import type { ColorProps } from "#/src/colors.ts";
import { createParts, type PolymorphicProps } from "#/src/parts.ts";
import type { ScaleValue, VariableProp } from "#/src/style-props.ts";
import { targetSize } from "#/src/target-size.stylex.ts";
import { tokens } from "#/src/tokens.stylex.ts";
import { variantColors } from "#/src/variant-colors.stylex.ts";

const styles = stylex.create({
  root: {
    "--button-fz": tokens["--solix-font-size-sm"],
    "--button-height": tokens["--solix-control-height-sm"],
    "--button-padding-x": tokens["--solix-control-padding-sm"],
    "--button-radius": `calc(${tokens["--solix-radius-lg"]} * 3)`,
    backgroundColor: {
      default: variantColors["--sx-variant-background"],
      ":hover": variantColors["--sx-variant-hover"],
    },
    borderColor: variantColors["--sx-variant-border"],
    borderRadius: "var(--button-radius)",
    borderStyle: "solid",
    borderWidth: "0.0625rem",
    color: variantColors["--sx-variant-color"],
    cursor: "pointer",
    fontSize: "var(--button-fz)",
    fontWeight: 500,
    height: "var(--button-height)",
    minHeight: targetSize.minimum,
    minWidth: targetSize.minimum,
    outlineColor: tokens["--solix-color-focus"],
    outlineOffset: "0.125rem",
    outlineStyle: {
      default: "none",
      ":focus-visible": "solid",
    },
    outlineWidth: "0.125rem",
    paddingInline: "var(--button-padding-x)",
  },
});

export type ButtonProps<T extends ValidComponent = "button"> = PolymorphicProps<
  T,
  typeof styles,
  ColorProps & {
    size?: VariableProp<"button-height", ScaleValue<"control-height">>;
    radius?: VariableProp<"button-radius">;
  }
>;

export function Button<T extends ValidComponent = "button">(props: ButtonProps<T>): JSX.Element;
export function Button(props: ButtonProps): JSX.Element;
export function Button<T extends ValidComponent = "button">(props: ButtonProps<T>) {
  const { root } = createParts("Button", styles, props, {
    variables: {
      "button-fz": "size",
      "button-height": "size",
      "button-padding-x": "size",
      "button-radius": "radius",
    },
    color: "filled",
  });
  const Root = dynamic(() => props.component ?? "button");
  return <Root {...root} />;
}
