import { createBrowserValue } from "./internal-browser-value";

export function createUnbranded(): () => number {
  return createBrowserValue(() => undefined, { loadingValue: 0 });
}
