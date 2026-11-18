import { createMediaQuery } from "@solix/primitives";
import { type Accessor, createContext, createEffect, createSignal, useContext } from "solid-js";
import type { SolixColorSchemeManager } from "#/src/color-scheme-manager.ts";
import {
  colorSchemeAttribute,
  colorSchemes,
  defaultColorScheme,
  isColorScheme,
  prefersColorScheme,
  resolvedColorScheme,
  type SolixColorScheme,
  type SolixComputedColorScheme,
  systemColorScheme,
} from "#/src/color-schemes.ts";
import { colorSchemeStorageKey } from "#/src/local-storage-manager.ts";

export type ColorSchemeOptions = {
  manager: () => SolixColorSchemeManager;
  defaultColorScheme: () => SolixColorScheme;
  forceColorScheme: () => SolixComputedColorScheme | undefined;
  getRootElement: () => HTMLElement | undefined;
};

export type SolixColorSchemeControls = {
  colorScheme: Accessor<SolixColorScheme>;
  setColorScheme: (value: SolixColorScheme) => void;
  toggleColorScheme: () => void;
  clearColorScheme: () => void;
};

export type ProvidedColorScheme = SolixColorSchemeControls & {
  computedColorScheme: Accessor<SolixComputedColorScheme>;
};

const darkSchemeQuery = prefersColorScheme("dark");

export const ColorSchemeContext = createContext<ProvidedColorScheme | null>(null);

export function createProvidedColorScheme(options: ColorSchemeOptions): ProvidedColorScheme {
  const prefersDark = createMediaQuery(darkSchemeQuery);
  const [read, setRead] = createSignal<{ stored: SolixColorScheme | undefined } | undefined>(
    undefined,
  );
  const followed = () => {
    const forced = options.forceColorScheme();
    return forced === undefined ? options.manager() : undefined;
  };
  const colorScheme = () =>
    options.forceColorScheme() ?? read()?.stored ?? options.defaultColorScheme();
  const computedColorScheme = () => resolvedColorScheme(colorScheme(), prefersDark());
  const setColorScheme = (value: SolixColorScheme) => followed()?.set(value);

  createEffect(followed, (manager) => {
    setRead({ stored: manager?.get() });
    return manager?.subscribe((stored) => setRead({ stored }));
  });

  createEffect(
    () => read() && { element: options.getRootElement(), scheme: computedColorScheme() },
    (write) => write?.element?.setAttribute(colorSchemeAttribute, write.scheme),
  );

  return {
    colorScheme,
    computedColorScheme,
    setColorScheme,
    toggleColorScheme: () => setColorScheme(computedColorScheme() === "light" ? "dark" : "light"),
    clearColorScheme: () => followed()?.clear(),
  };
}

export function provided(caller: string): ProvidedColorScheme {
  const scheme = useContext(ColorSchemeContext);
  if (scheme === null) {
    throw new Error(`${caller} reads the colour scheme of SolixProvider: call it inside one.`);
  }
  return scheme;
}

export function createColorScheme(): SolixColorSchemeControls {
  const { colorScheme, setColorScheme, toggleColorScheme, clearColorScheme } =
    provided("createColorScheme");
  return { colorScheme, setColorScheme, toggleColorScheme, clearColorScheme };
}

function scriptString(value: string): string {
  return JSON.stringify(value).replaceAll("<", "\\u003c");
}

export type ColorSchemeScriptOptions = {
  defaultColorScheme?: SolixColorScheme;
  forceColorScheme?: SolixComputedColorScheme;
  localStorageKey?: string;
};

export function colorSchemeScriptText(options: ColorSchemeScriptOptions): string {
  const setAttribute = (scheme: string) =>
    `document.documentElement.setAttribute(${scriptString(colorSchemeAttribute)},${scheme})`;
  if (options.forceColorScheme !== undefined && isColorScheme(options.forceColorScheme)) {
    return `${setAttribute(scriptString(options.forceColorScheme))};`;
  }
  const fallback = isColorScheme(options.defaultColorScheme)
    ? options.defaultColorScheme
    : defaultColorScheme;
  return [
    "try{",
    `var s=localStorage.getItem(${scriptString(options.localStorageKey ?? colorSchemeStorageKey)});`,
    `var c=${JSON.stringify(colorSchemes)}.indexOf(s)===-1?${scriptString(fallback)}:s;`,
    `if(c===${scriptString(systemColorScheme)})c=matchMedia(${scriptString(darkSchemeQuery)}).matches?${scriptString(resolvedColorScheme(systemColorScheme, true))}:${scriptString(resolvedColorScheme(systemColorScheme, false))};`,
    `${setAttribute("c")}`,
    "}catch(e){}",
  ].join("");
}
