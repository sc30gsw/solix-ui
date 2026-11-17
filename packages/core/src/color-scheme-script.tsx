import type { JSX } from "@solidjs/web";
import { omit, useContext } from "solid-js";
import { type ColorSchemeScriptOptions, colorSchemeScriptText } from "#/src/color-scheme.ts";
import { StyleNonceContext } from "#/src/run-time-style.ts";

export type ColorSchemeScriptProps = ColorSchemeScriptOptions &
  Omit<JSX.ScriptHTMLAttributes<HTMLScriptElement>, "children" | "innerHTML" | "textContent">;

export function ColorSchemeScript(props: ColorSchemeScriptProps) {
  const pageNonce = useContext(StyleNonceContext);
  const others = omit(props, "defaultColorScheme", "forceColorScheme", "localStorageKey");
  return <script nonce={pageNonce()} {...others} innerHTML={colorSchemeScriptText(props)} />;
}
