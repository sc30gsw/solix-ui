import * as stylex from "@stylexjs/stylex";
import { dynamic, type ValidComponent } from "@solidjs/web";
import { createParts, type PartProps } from "./parts";
import type { PolymorphicProps } from "./style-props";

const styles = stylex.create({
  root: {},
});

export function Box<T extends ValidComponent = "div">(
  props: PolymorphicProps<T, PartProps<typeof styles>>,
) {
  const { root } = createParts("Box", styles, props);
  const Root = dynamic(() => props.component ?? "div");
  return <Root {...root} />;
}
