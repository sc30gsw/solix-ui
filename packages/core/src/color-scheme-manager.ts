import type { SolixColorScheme } from "#/src/color-scheme.ts";

export type SolixColorSchemeManager = {
  get: (defaultValue: SolixColorScheme) => SolixColorScheme;
  set: (value: SolixColorScheme) => void;
  subscribe: (onUpdate: (colorScheme: SolixColorScheme) => void) => void;
  unsubscribe: () => void;
  clear: () => void;
};

const colorSchemes: readonly unknown[] = ["light", "dark", "auto"] satisfies SolixColorScheme[];

export function isSolixColorScheme(value: unknown): value is SolixColorScheme {
  return colorSchemes.includes(value);
}
