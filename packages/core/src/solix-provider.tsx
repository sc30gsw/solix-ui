import type { JSX } from "@solidjs/web";
import { Show, untrack, useContext } from "solid-js";
import {
  ColorSchemeContext,
  createProvidedColorScheme,
  type ProvidedColorScheme,
} from "#/src/color-scheme.ts";
import type { SolixColorSchemeManager } from "#/src/color-scheme-manager.ts";
import { defaultColorScheme, type SolixColorScheme } from "#/src/color-schemes.ts";
import type { SolixComputedColorScheme } from "#/src/computed-color-scheme.ts";
import { type SolixTheme, themeStyleSheet } from "#/src/create-theme.ts";
import { LibraryStyle } from "#/src/library-style.tsx";
import { localStorageColorSchemeManager } from "#/src/local-storage-manager.ts";
import { type GetStyleNonce, PageNonceContext } from "#/src/run-time-style.ts";

export type SolixProviderProps = {
  /** The theme whose tokens the provider sets, made with `createTheme`. */
  theme?: SolixTheme;
  /** Gives the Content Security Policy nonce for every style the library adds at run time. */
  getStyleNonce?: GetStyleNonce;
  /** The selector the theme's custom properties are set on. */
  cssVariablesSelector?: string;
  /** Adds the theme's custom properties to the page; turn it off when the stylesheet already holds them. */
  withCssVariables?: boolean;
  /** Stores the colour scheme the user picks and tells of changes; `localStorage` unless given. */
  colorSchemeManager?: SolixColorSchemeManager;
  /** The colour scheme while nothing is stored; `auto` follows the system. */
  defaultColorScheme?: SolixColorScheme;
  /** Holds the colour scheme to this one, whatever is stored or picked. */
  forceColorScheme?: SolixComputedColorScheme;
  /** Gives the element that carries the colour scheme; `<html>` unless given. */
  getRootElement?: () => HTMLElement | undefined;
  /** The part of the page the provider's theme and colour scheme reach. */
  children?: JSX.Element;
};

const storedInLocalStorage = localStorageColorSchemeManager();
const schemeProps = [
  "colorSchemeManager",
  "defaultColorScheme",
  "forceColorScheme",
] as const satisfies readonly (keyof SolixProviderProps)[];

function colorSchemeOf(props: SolixProviderProps): ProvidedColorScheme {
  const outer = useContext(ColorSchemeContext);
  const given = untrack(() => ({
    root: props.getRootElement !== undefined,
    scheme: schemeProps.filter((name) => props[name] !== undefined),
  }));
  if (outer === null || given.root) {
    return createProvidedColorScheme({
      manager: () => props.colorSchemeManager ?? storedInLocalStorage,
      defaultColorScheme: () => props.defaultColorScheme ?? defaultColorScheme,
      forceColorScheme: () => props.forceColorScheme,
      getRootElement: () =>
        props.getRootElement === undefined ? document.documentElement : props.getRootElement(),
    });
  }
  if (given.scheme.length > 0) {
    throw new Error(
      `A SolixProvider inside another is given ${given.scheme.join(", ")} and no getRootElement. Give it getRootElement, the element its own scheme is written on, or leave these props out, and it passes on the scheme of the provider around it.`,
    );
  }
  return outer;
}

export function SolixProvider(props: SolixProviderProps) {
  const outerNonce = useContext(PageNonceContext);
  const colorScheme = colorSchemeOf(props);
  const styleSheet = () =>
    (props.withCssVariables ?? true)
      ? themeStyleSheet(props.theme ?? {}, props.cssVariablesSelector ?? ":root")
      : undefined;
  return (
    <PageNonceContext value={() => props.getStyleNonce?.() ?? outerNonce()}>
      <ColorSchemeContext value={colorScheme}>
        <Show when={styleSheet()}>{(css) => <LibraryStyle of="theme" css={css()} />}</Show>
        {props.children}
      </ColorSchemeContext>
    </PageNonceContext>
  );
}
