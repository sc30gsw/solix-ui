import type { JSX } from "@solidjs/web";
import { omit, useContext } from "solid-js";
import {
  colorSchemeAttribute,
  type ColorSchemeOptions,
  colorSchemes,
  defaultColorScheme,
  isColorScheme,
  prefersColorScheme,
  resolvedColorScheme,
  systemColorScheme,
} from "#/src/color-schemes.ts";
import { colorSchemeStorageKey } from "#/src/local-storage-manager.ts";
import { nonceOf, PageNonceContext } from "#/src/run-time-style.ts";
import { defaultsOf, withDefaults } from "#/src/parts.ts";

export type ColorSchemeScriptOptions = ColorSchemeOptions & {
  localStorageKey?: string;
};

export type ColorSchemeScriptProps = ColorSchemeScriptOptions &
  Omit<
    JSX.ScriptHTMLAttributes<HTMLScriptElement>,
    "children" | "innerHTML" | "nonce" | "textContent"
  > & {
    nonce?: string | null | false;
    children?: never;
    textContent?: never;
  };

type OptionsAsGiven = {
  defaultColorScheme?: unknown;
  forceColorScheme?: unknown;
  localStorageKey?: string;
};

const defaults = defaultsOf<ColorSchemeScriptOptions>()({
  defaultColorScheme,
  localStorageKey: colorSchemeStorageKey,
});

function inScript(value: unknown): string {
  return JSON.stringify(value).replaceAll("<", "\\u003c");
}

export function colorSchemeScriptText(options: OptionsAsGiven): string {
  const given = withDefaults(defaults, options);
  const setTo = (scheme: string) =>
    `document.documentElement.setAttribute(${inScript(colorSchemeAttribute)},${scheme})`;
  if (isColorScheme(given.forceColorScheme)) return `${setTo(inScript(given.forceColorScheme))};`;
  const fallback = isColorScheme(given.defaultColorScheme)
    ? given.defaultColorScheme
    : defaultColorScheme;
  return [
    `(function(){var c=${inScript(fallback)};`,
    `try{var s=localStorage.getItem(${inScript(given.localStorageKey)});`,
    `if(${inScript(colorSchemes)}.indexOf(s)!==-1)c=s}catch(e){}`,
    `try{if(c===${inScript(systemColorScheme)})c=matchMedia(${inScript(prefersColorScheme("dark"))}).matches?`,
    `${inScript(resolvedColorScheme(systemColorScheme, true))}:${inScript(resolvedColorScheme(systemColorScheme, false))}}catch(e){}`,
    `${setTo("c")}})();`,
  ].join("");
}

export function ColorSchemeScript(props: ColorSchemeScriptProps) {
  const pageNonce = useContext(PageNonceContext);
  const others = omit(
    props,
    "defaultColorScheme",
    "forceColorScheme",
    "localStorageKey",
    "nonce",
    "children",
    "textContent",
  );
  return (
    <script
      {...others}
      nonce={props.nonce === false ? false : (nonceOf(props.nonce) ?? pageNonce())}
      innerHTML={colorSchemeScriptText(props)}
    />
  );
}
