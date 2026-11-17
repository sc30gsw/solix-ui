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
import { isSolixColorScheme, type SolixColorSchemeManager } from "#/src/color-scheme-manager.ts";
import { colorSchemeStorageKey } from "#/src/local-storage-manager.ts";
import { colorSchemeAttribute } from "#/src/style-prop-table.ts";

export type SolixColorScheme = "light" | "dark" | "auto";

export type SolixComputedColorScheme = Exclude<SolixColorScheme, "auto">;

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

export const defaultColorScheme = "light" satisfies SolixColorScheme;
export const darkSchemeQuery = "(prefers-color-scheme: dark)";

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
    const scheme = colorScheme();
    if (scheme !== "auto") return scheme;
    darkPreferred();
    return prefersDark() ? "dark" : "light";
  };

  onSettled(() => {
    const manager = options.manager();
    setChosen(manager.get(options.defaultColorScheme()));
    setSettled(true);
    manager.subscribe(setChosen);
    return () => manager.unsubscribe();
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
    computedColorScheme: () => {
      const scheme = colorScheme();
      if (scheme !== "auto") return scheme;
      return darkPreferred() ? "dark" : "light";
    },
    currentColorScheme,
    setColorScheme: (value) => {
      const forced = options.forceColorScheme();
      if (forced !== undefined) return;
      setChosen(value);
      options.manager().set(value);
    },
    clearColorScheme: () => {
      setChosen(options.defaultColorScheme());
      options.manager().clear();
    },
  };
}

export function provided(caller: string): ProvidedColorScheme {
  const scheme = useContext(ColorSchemeContext);
  if (scheme === null) {
    throw new Error(`${caller} reads the colour scheme of SolixProvider: call it inside one.`);
  }
  return scheme;
}

export function createSolixColorScheme(): SolixColorSchemeControls {
  const { colorScheme, setColorScheme, clearColorScheme, currentColorScheme } =
    provided("createSolixColorScheme");
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
  if (options.forceColorScheme !== undefined && isSolixColorScheme(options.forceColorScheme)) {
    return `${setAttribute(scriptString(options.forceColorScheme))};`;
  }
  const fallback = isSolixColorScheme(options.defaultColorScheme)
    ? options.defaultColorScheme
    : defaultColorScheme;
  return [
    "try{",
    `var s=localStorage.getItem(${scriptString(options.localStorageKey ?? colorSchemeStorageKey)});`,
    `var c=s==="light"||s==="dark"||s==="auto"?s:${scriptString(fallback)};`,
    `if(c==="auto")c=matchMedia(${scriptString(darkSchemeQuery)}).matches?"dark":"light";`,
    `${setAttribute("c")}`,
    "}catch(e){}",
  ].join("");
}
