import * as stylex from "@stylexjs/stylex";
import { dynamic, type JSX, type ValidComponent } from "@solidjs/web";
import { createParts, type PolymorphicProps, withDefaults } from "#/src/parts.ts";

const styles = stylex.create({
  root: {},
});

export type BoxProps<T extends ValidComponent = "div"> = PolymorphicProps<T, typeof styles>;

const defaults = { component: "div" } satisfies Partial<BoxProps>;

export function Box<T extends ValidComponent = "div">(props: BoxProps<T>): JSX.Element;
export function Box(props: BoxProps): JSX.Element;
export function Box<T extends ValidComponent = "div">(rawProps: BoxProps<T>) {
  const props = withDefaults(defaults, rawProps);
  const { root } = createParts("Box", styles, props);
  const Root = dynamic(() => props.component);
  return <Root {...root} />;
}
