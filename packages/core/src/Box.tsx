import { createMemo, omit } from "solid-js";
import { dynamic, type ValidComponent } from "@solidjs/web";
import { type PolymorphicProps, resolveStyleProps, stylePropKeys } from "./style-props";

export function Box<T extends ValidComponent = "div">(props: PolymorphicProps<T>) {
  const rest = omit(props, "class", "style", "component", ...stylePropKeys);
  const Root = dynamic(() => props.component ?? "div");
  const resolved = createMemo(() => resolveStyleProps(props));
  return (
    <Root
      {...rest}
      class={["solix-Box-root", resolved().classes, props.class]}
      style={resolved().style}
    />
  );
}
