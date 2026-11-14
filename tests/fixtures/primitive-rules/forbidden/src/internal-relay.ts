import { createBrowserValue } from "./internal-browser-value";

export function relayed(): () => number {
  return createBrowserValue(() => undefined, { loadingValue: 0 });
}
