import * as stylex from "@stylexjs/stylex";
import { dynamic, type JSX, type ValidComponent } from "@solidjs/web";
import { createParts, type PolymorphicProps } from "#/src/parts.ts";
import { tokens } from "#/src/tokens.stylex.ts";

const styles = stylex.create({
  root: {
    backgroundColor: tokens["--solix-color-primary"],
    borderRadius: tokens["--solix-radius-md"],
    borderWidth: 0,
    color: tokens["--solix-color-on-primary"],
    cursor: "pointer",
    fontSize: "0.875rem",
    height: tokens["--solix-control-height-md"],
    paddingInline: "1rem",
  },
});

export type ButtonProps<T extends ValidComponent = "button"> = PolymorphicProps<T, typeof styles>;

export function Button<T extends ValidComponent = "button">(props: ButtonProps<T>): JSX.Element;
export function Button(props: ButtonProps): JSX.Element;
export function Button<T extends ValidComponent = "button">(props: ButtonProps<T>) {
  const { root } = createParts("Button", styles, props);
  const Root = dynamic(() => props.component ?? "button");
  return <Root {...root} />;
}
