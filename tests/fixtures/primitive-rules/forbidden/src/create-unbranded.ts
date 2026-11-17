import { createBrowserValue } from "#/packages/primitives/src/internal-browser-value.ts";

/** Holds what the rules forbid. */
export function createUnbranded(): () => number {
  return createBrowserValue(() => undefined, { loadingValue: 0 });
}
