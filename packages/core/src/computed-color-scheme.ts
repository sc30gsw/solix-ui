import type { Accessor } from "solid-js";
import { provided, type SolixComputedColorScheme } from "#/src/color-scheme.ts";

export function createComputedColorScheme(): Accessor<SolixComputedColorScheme> {
  return provided("createComputedColorScheme").computedColorScheme;
}
