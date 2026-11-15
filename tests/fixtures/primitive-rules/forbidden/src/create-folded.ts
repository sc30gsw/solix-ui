import { createScrollFold } from "../../../../../packages/primitives/src/internal-scroll";
import type { BrowserValue } from "../../../../../packages/primitives/src/types";

export function createFolded(): BrowserValue<number> {
  return createScrollFold(
    () => 0,
    (state) => state,
    { loadingValue: 0 },
  );
}
