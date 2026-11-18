import type { Accessor } from "solid-js";
import { provided } from "#/src/color-scheme.ts";
import type { SolixComputedColorScheme } from "#/src/color-schemes.ts";

export function createComputedColorScheme(): Accessor<SolixComputedColorScheme> {
  return provided("createComputedColorScheme").computedColorScheme;
}
