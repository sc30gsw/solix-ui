import type { JSX } from "@solidjs/web";
import { Show, useContext } from "solid-js";
import {
  ColorSchemeContext,
  createProvidedColorScheme,
  defaultColorScheme,
  type SolixColorScheme,
  type SolixComputedColorScheme,
} from "#/src/color-scheme.ts";
import type { SolixColorSchemeManager } from "#/src/color-scheme-manager.ts";
import { type SolixTheme, themeStyleSheet } from "#/src/create-theme.ts";
import { LibraryStyle } from "#/src/library-style.tsx";
import { localStorageColorSchemeManager } from "#/src/local-storage-manager.ts";
import { type GetStyleNonce, StyleNonceContext } from "#/src/run-time-style.ts";

export type SolixProviderProps = {
  theme?: SolixTheme;
  getStyleNonce?: GetStyleNonce;
  cssVariablesSelector?: string;
  withCssVariables?: boolean;
  colorSchemeManager?: SolixColorSchemeManager;
  defaultColorScheme?: SolixColorScheme;
  forceColorScheme?: SolixComputedColorScheme;
  getRootElement?: () => HTMLElement | undefined;
  children?: JSX.Element;
};

function documentElement(): HTMLElement {
  return document.documentElement;
}

export function SolixProvider(props: SolixProviderProps) {
  const outerNonce = useContext(StyleNonceContext);
  const storedInLocalStorage = localStorageColorSchemeManager();
  const colorScheme = createProvidedColorScheme({
    manager: () => props.colorSchemeManager ?? storedInLocalStorage,
    defaultColorScheme: () => props.defaultColorScheme ?? defaultColorScheme,
    forceColorScheme: () => props.forceColorScheme,
    getRootElement: () => (props.getRootElement ?? documentElement)(),
  });
  const styleSheet = () =>
    (props.withCssVariables ?? true)
      ? themeStyleSheet(props.theme ?? {}, props.cssVariablesSelector ?? ":root")
      : undefined;
  return (
    <StyleNonceContext value={() => props.getStyleNonce?.() ?? outerNonce()}>
      <ColorSchemeContext value={colorScheme}>
        <Show when={styleSheet()}>{(css) => <LibraryStyle of="theme" css={css()} />}</Show>
        {props.children}
      </ColorSchemeContext>
    </StyleNonceContext>
  );
}
