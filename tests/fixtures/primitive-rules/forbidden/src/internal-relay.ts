import { createBrowserValue } from "#/packages/primitives/src/internal-browser-value.ts";

export function relayed(): () => number {
  return createBrowserValue(() => undefined, { loadingValue: 0 });
}
