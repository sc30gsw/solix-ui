import * as stylex from "@stylexjs/stylex";
import { dynamic, type JSX, type ValidComponent } from "@solidjs/web";
import { createParts, type PolymorphicProps, withDefaults } from "#/src/parts.ts";

const styles = stylex.create({
  root: {
    alignItems: "center",
    display: {
      default: "flex",
      "[data-inline]": "inline-flex",
    },
    justifyContent: "center",
  },
});

export type CenterProps<T extends ValidComponent = "div"> = PolymorphicProps<
  T,
  typeof styles,
  {
    /** Lays the root out as `inline-flex`, so it sits inside a line of text. */
    inline?: boolean;
  }
>;

const defaults = { component: "div" } satisfies Partial<CenterProps>;

export function Center<T extends ValidComponent = "div">(props: CenterProps<T>): JSX.Element;
export function Center(props: CenterProps): JSX.Element;
export function Center<T extends ValidComponent = "div">(rawProps: CenterProps<T>) {
  const props = withDefaults(defaults, rawProps);
  const { root } = createParts("Center", styles, props, { keep: ["inline"] });
  const Root = dynamic(() => props.component);
  return <Root data-inline={props.inline ? "true" : undefined} {...root} />;
}
