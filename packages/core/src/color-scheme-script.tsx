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
import { PageNonceContext } from "#/src/run-time-style.ts";

export type ColorSchemeScriptOptions = ColorSchemeOptions & {
  /** The `localStorage` key the stored colour scheme is read from. */
  localStorageKey?: string;
};

export type ColorSchemeScriptProps = ColorSchemeScriptOptions &
  Omit<JSX.ScriptHTMLAttributes<HTMLScriptElement>, "children" | "innerHTML" | "textContent"> & {
    children?: never;
    textContent?: never;
  };

type OptionsAsGiven = {
  defaultColorScheme?: unknown;
  forceColorScheme?: unknown;
  localStorageKey?: string;
};

const defaults = {
  defaultColorScheme,
  localStorageKey: colorSchemeStorageKey,
} satisfies Partial<ColorSchemeScriptOptions>;

function inScript(value: unknown): string {
  return JSON.stringify(value).replaceAll("<", "\\u003c");
}

export function colorSchemeScriptText(options: OptionsAsGiven): string {
  const setTo = (scheme: string) =>
    `document.documentElement.setAttribute(${inScript(colorSchemeAttribute)},${scheme})`;
  if (isColorScheme(options.forceColorScheme))
    return `${setTo(inScript(options.forceColorScheme))};`;
  const fallback = isColorScheme(options.defaultColorScheme)
    ? options.defaultColorScheme
    : defaults.defaultColorScheme;
  return [
    `(function(){var c=${inScript(fallback)};`,
    `try{var s=localStorage.getItem(${inScript(options.localStorageKey ?? defaults.localStorageKey)});`,
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
      nonce={props.nonce ?? pageNonce()}
      innerHTML={colorSchemeScriptText(props)}
    />
  );
}
