import { createMediaQuery } from "@solix/primitives";
import { isServer } from "@solidjs/web";
import {
  type Accessor,
  createContext,
  createEffect,
  createSignal,
  onSettled,
  useContext,
} from "solid-js";
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

type ProvidedColorScheme = Omit<SolixColorSchemeControls, "toggleColorScheme"> & {
  computedColorScheme: Accessor<SolixComputedColorScheme>;
  currentColorScheme: () => SolixComputedColorScheme;
};

const darkSchemeQuery = prefersColorScheme("dark");

export const ColorSchemeContext = createContext<ProvidedColorScheme | null>(null);

function prefersDark(): boolean {
  return !isServer && globalThis.matchMedia?.(darkSchemeQuery).matches === true;
}

export function createProvidedColorScheme(options: ColorSchemeOptions): ProvidedColorScheme {
  const [chosen, setChosen] = createSignal<SolixColorScheme | undefined>(undefined);
  const [settled, setSettled] = createSignal(false);
  const darkPreferred = createMediaQuery(darkSchemeQuery);
  const colorScheme = () => options.forceColorScheme() ?? chosen() ?? options.defaultColorScheme();
  const currentColorScheme = (): SolixComputedColorScheme => {
    darkPreferred();
    return resolvedColorScheme(colorScheme(), prefersDark());
  };

  onSettled(() => {
    const manager = options.manager();
    setChosen(manager.get() ?? options.defaultColorScheme());
    setSettled(true);
    return manager.subscribe((stored) => setChosen(stored ?? options.defaultColorScheme()));
  });

  createEffect(
    () => (settled() ? currentColorScheme() : undefined),
    (scheme) => {
      if (scheme !== undefined)
        options.getRootElement()?.setAttribute(colorSchemeAttribute, scheme);
    },
  );

  return {
    colorScheme,
    computedColorScheme: () => resolvedColorScheme(colorScheme(), darkPreferred()),
    currentColorScheme,
    setColorScheme: (value) => {
      const forced = options.forceColorScheme();
      if (forced !== undefined) return;
      options.manager().set(value);
    },
    clearColorScheme: () => options.manager().clear(),
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
  const { colorScheme, setColorScheme, clearColorScheme, currentColorScheme } =
    provided("createColorScheme");
  return {
    colorScheme,
    setColorScheme,
    clearColorScheme,
    toggleColorScheme: () => setColorScheme(currentColorScheme() === "light" ? "dark" : "light"),
  };
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
