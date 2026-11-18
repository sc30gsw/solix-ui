import type { SolixColorScheme } from "#/src/color-schemes.ts";

export type SolixColorSchemeManager = {
  get: (defaultValue: SolixColorScheme) => SolixColorScheme;
  set: (value: SolixColorScheme) => void;
  subscribe: (onUpdate: (colorScheme: SolixColorScheme) => void) => void;
  unsubscribe: () => void;
  clear: () => void;
};
