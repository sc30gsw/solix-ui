import type { BrowserValue } from "./types";

export function createBranded(): BrowserValue<number> {
  return (() => 0) as BrowserValue<number>;
}
