import * as stylex from "@stylexjs/stylex";
import type { JSX } from "@solidjs/web";
import { type Styling, withConsumerStyle } from "./style-props";

type CompiledParts = Readonly<Record<string, stylex.CompiledStyles>>;

export type PartProps<Styles> = {
  classes?: Partial<Record<keyof Styles, JSX.ClassValue>>;
  styles?: Partial<Record<keyof Styles, JSX.CSSProperties>>;
  unstyled?: boolean;
};

type PartAttributes = {
  class: JSX.ClassValue;
  style: JSX.CSSProperties | string | undefined;
};

export const partPropKeys = [
  "classes",
  "styles",
  "unstyled",
] as const satisfies readonly (keyof PartProps<object>)[];

const rootPart = "root";

export function createParts<Styles extends CompiledParts>(
  component: string,
  styles: Styles,
  props: PartProps<Styles> & Styling,
): (part: keyof Styles & string) => PartAttributes {
  return (part) => {
    const isRoot = part === rootPart;
    return {
      class: [
        props.unstyled ? undefined : stylex.attrs(styles[part]).class,
        `solix-${component}-${part}`,
        props.classes?.[part],
        isRoot ? props.class : undefined,
      ],
      style: withConsumerStyle(props.styles?.[part] ?? {}, isRoot ? props.style : undefined),
    };
  };
}
