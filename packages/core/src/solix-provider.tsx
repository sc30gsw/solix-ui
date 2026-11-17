import type { JSX } from "@solidjs/web";
import { Show } from "solid-js";
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
  const styleSheet = () =>
    (props.withCssVariables ?? true)
      ? themeStyleSheet(props.theme ?? {}, props.cssVariablesSelector ?? ":root")
      : undefined;
  return (
    <StyleNonceContext value={() => props.getStyleNonce?.()}>
      <Show when={styleSheet()}>{(css) => <LibraryStyle of="theme" css={css()} />}</Show>
      {props.children}
    </StyleNonceContext>
  );
}
