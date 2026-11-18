import { localStorageColorSchemeManager, type SolixColorScheme } from "@solix/core";
import { playgroundColorSchemeKey } from "#/src/sections/color-scheme-setups.ts";

export const pageColorScheme: SolixColorScheme = "auto";
export const pageColorSchemeManager = localStorageColorSchemeManager({
  key: playgroundColorSchemeKey,
});
