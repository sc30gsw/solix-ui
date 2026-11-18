import type { SolixColorScheme } from "#/src/color-schemes.ts";

export type SolixColorSchemeManager = {
  get: () => SolixColorScheme | undefined;
  set: (value: SolixColorScheme) => void;
  clear: () => void;
  subscribe: (onUpdate: (colorScheme: SolixColorScheme | undefined) => void) => () => void;
};
