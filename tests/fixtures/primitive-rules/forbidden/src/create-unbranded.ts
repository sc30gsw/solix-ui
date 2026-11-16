import { createBrowserValue } from "../../../../../packages/primitives/src/internal-browser-value";

/** Holds what the rules forbid. */
export function createUnbranded(): () => number {
  return createBrowserValue(() => undefined, { loadingValue: 0 });
}
