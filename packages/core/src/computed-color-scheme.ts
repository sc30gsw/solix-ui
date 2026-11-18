import type { SolixColorScheme, systemColorScheme } from "#/src/color-schemes.ts";

export type SolixComputedColorScheme = Exclude<SolixColorScheme, typeof systemColorScheme>;
