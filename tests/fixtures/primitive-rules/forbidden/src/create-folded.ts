import { createScrollFold } from "#/packages/primitives/src/internal-scroll.ts";
import type { BrowserValue } from "#/packages/primitives/src/types.ts";

/** Holds what the rules forbid. */
export function createFolded(): BrowserValue<number> {
  return createScrollFold(
    () => 0,
    (state) => state,
    { loadingValue: 0 },
  );
}
