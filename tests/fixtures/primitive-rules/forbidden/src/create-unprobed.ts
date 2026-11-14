import { createBrowserValue } from "./internal-browser-value";

export function createUnprobed(): () => number {
  return createBrowserValue(() => undefined, { loadingValue: 0 });
}
