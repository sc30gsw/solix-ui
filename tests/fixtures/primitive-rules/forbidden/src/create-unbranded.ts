import { createBrowserValue } from "../../../../../packages/primitives/src/internal-browser-value";

export function createUnbranded(): () => number {
  return createBrowserValue(() => undefined, { loadingValue: 0 });
}
