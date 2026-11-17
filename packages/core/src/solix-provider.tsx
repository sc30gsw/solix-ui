import type { JSX } from "@solidjs/web";
import { Show, useContext } from "solid-js";
import { type SolixTheme, themeStyleSheet } from "./create-theme";
import { LibraryStyle } from "./library-style";
import { type GetStyleNonce, StyleNonceContext } from "./run-time-style";

export type SolixProviderProps = {
  theme?: SolixTheme;
  getStyleNonce?: GetStyleNonce;
  cssVariablesSelector?: string;
  withCssVariables?: boolean;
  children?: JSX.Element;
};

export function SolixProvider(props: SolixProviderProps) {
  const outerNonce = useContext(StyleNonceContext);
  const styleSheet = () =>
    (props.withCssVariables ?? true)
      ? themeStyleSheet(props.theme ?? {}, props.cssVariablesSelector ?? ":root")
      : undefined;
  return (
    <StyleNonceContext value={() => props.getStyleNonce?.() ?? outerNonce()}>
      <Show when={styleSheet()}>{(css) => <LibraryStyle of="theme" css={css()} />}</Show>
      {props.children}
    </StyleNonceContext>
  );
}
