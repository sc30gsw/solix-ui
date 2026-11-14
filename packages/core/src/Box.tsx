import { createMemo, omit } from "solid-js";
import { type ComponentProps, dynamic, type JSX, type ValidComponent } from "@solidjs/web";
import {
  resolveStyleProps,
  stylePropNames,
  type StyleProps,
  visibilityPropNames,
} from "./style-props";
import { tokens } from "./tokens.stylex";

type PolymorphicProps<T extends ValidComponent, Own> = Own & { component?: T } & Omit<
    ComponentProps<T>,
    keyof Own | "component"
  >;

type BoxProps = StyleProps & {
  class?: JSX.ClassValue;
  style?: JSX.CSSProperties | string;
};

function declarations(style: JSX.CSSProperties): string {
  return Object.entries(style)
    .map(([property, value]) => `${property}:${value};`)
    .join("");
}

function withConsumerStyle(
  own: JSX.CSSProperties,
  consumer: JSX.CSSProperties | string | undefined,
): JSX.CSSProperties | string | undefined {
  if (typeof consumer === "string") return `${declarations(own)}${consumer}`;
  if (consumer === undefined && Object.keys(own).length === 0) return undefined;
  return { ...own, ...consumer };
}

export function Box<T extends ValidComponent = "div">(props: PolymorphicProps<T, BoxProps>) {
  const rest = omit(
    props,
    "class",
    "style",
    "component",
    ...stylePropNames,
    ...visibilityPropNames,
  );
  const Root = dynamic(() => props.component ?? "div");
  const resolved = createMemo(() => resolveStyleProps(props, tokens));
  return (
    <Root
      {...rest}
      class={["solix-Box-root", resolved().classes, props.class]}
      style={withConsumerStyle(resolved().style, props.style)}
    />
  );
}
