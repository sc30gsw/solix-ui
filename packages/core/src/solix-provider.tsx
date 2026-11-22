import type { JSX } from "@solidjs/web";
import { Show, untrack, useContext } from "solid-js";
import {
  ColorSchemeContext,
  createProvidedColorScheme,
  type ProvidedColorScheme,
} from "#/src/color-scheme.ts";
import type { SolixColorSchemeManager } from "#/src/color-scheme-manager.ts";
import { type ColorSchemeOptions, defaultColorScheme } from "#/src/color-schemes.ts";
import { type SolixTheme, themeStyleSheet } from "#/src/create-theme.ts";
import { LibraryStyle } from "#/src/library-style.tsx";
import { localStorageColorSchemeManager } from "#/src/local-storage-manager.ts";
import { type GetStyleNonce, PageNonceContext } from "#/src/run-time-style.ts";
import { type DefaultValues, defaultsOf, type WithDefaults, withDefaults } from "#/src/parts.ts";

export type SolixProviderProps = ColorSchemeOptions & {
  theme?: SolixTheme;
  /** The nonce goes on every style the library adds at run time; without it, a provider inside another uses the outer provider's nonce. */
  getStyleNonce?: GetStyleNonce;
  /** The theme's custom properties go on what it selects, not on the children alone. */
  cssVariablesSelector?: string;
  withCssVariables?: boolean;
  /** Uses `localStorage` unless given. */
  colorSchemeManager?: SolixColorSchemeManager;
  /** `<html>` unless given. A provider inside another that is not given it passes on the outer provider's scheme, and throws if it is given `colorSchemeManager`, `defaultColorScheme` or `forceColorScheme`. */
  getRootElement?: () => HTMLElement | undefined;
  children?: JSX.Element;
};

const storedInLocalStorage = localStorageColorSchemeManager();
const defaults = defaultsOf<SolixProviderProps>()({
  defaultColorScheme,
  cssVariablesSelector: ":root",
  withCssVariables: true,
});
const schemeProps = [
  "colorSchemeManager",
  "defaultColorScheme",
  "forceColorScheme",
] as const satisfies readonly (keyof SolixProviderProps)[];

function colorSchemeOf(
  given: SolixProviderProps,
  props: WithDefaults<SolixProviderProps, DefaultValues<typeof defaults>>,
): ProvidedColorScheme {
  const outer = useContext(ColorSchemeContext);
  const passedOn = untrack(() => ({
    root: given.getRootElement !== undefined,
    scheme: schemeProps.filter((name) => given[name] !== undefined),
  }));
  if (outer === null || passedOn.root) {
    return createProvidedColorScheme({
      manager: () => props.colorSchemeManager ?? storedInLocalStorage,
      defaultColorScheme: () => props.defaultColorScheme,
      forceColorScheme: () => props.forceColorScheme,
      getRootElement: () =>
        props.getRootElement === undefined ? document.documentElement : props.getRootElement(),
    });
  }
  if (passedOn.scheme.length > 0) {
    throw new Error(
      `A SolixProvider inside another is given ${passedOn.scheme.join(", ")} and no getRootElement. Give it getRootElement, the element its own scheme is written on, or leave these props out, and it passes on the scheme of the provider around it.`,
    );
  }
  return outer;
}

export function SolixProvider(rawProps: SolixProviderProps) {
  const props = withDefaults(defaults, rawProps);
  const outerNonce = useContext(PageNonceContext);
  const colorScheme = colorSchemeOf(rawProps, props);
  const styleSheet = () =>
    props.withCssVariables
      ? themeStyleSheet(props.theme ?? {}, props.cssVariablesSelector)
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
