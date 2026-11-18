import { createMediaQuery } from "@solix/primitives";
import { type Accessor, createContext, createEffect, createSignal, useContext } from "solid-js";
import type { SolixColorSchemeManager } from "#/src/color-scheme-manager.ts";
import {
  colorSchemeAttribute,
  prefersColorScheme,
  resolvedColorScheme,
  type SolixColorScheme,
  type SolixComputedColorScheme,
} from "#/src/color-schemes.ts";

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

export const ColorSchemeContext = createContext<ProvidedColorScheme | null>(null);

export function createProvidedColorScheme(options: ColorSchemeOptions): ProvidedColorScheme {
  const prefersDark = createMediaQuery(prefersColorScheme("dark"));
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

function provided(reader: () => unknown): ProvidedColorScheme {
  const scheme = useContext(ColorSchemeContext);
  if (scheme === null) {
    throw new Error(`${reader.name} reads the colour scheme of SolixProvider: call it inside one.`);
  }
  return scheme;
}

export function createColorScheme(): SolixColorSchemeControls {
  const { colorScheme, setColorScheme, toggleColorScheme, clearColorScheme } =
    provided(createColorScheme);
  return { colorScheme, setColorScheme, toggleColorScheme, clearColorScheme };
}

export function createComputedColorScheme(): Accessor<SolixComputedColorScheme> {
  return provided(createComputedColorScheme).computedColorScheme;
}
