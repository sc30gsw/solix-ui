import type { BrowserValue } from "./types";

export function createBrowserValue<T>(
  subscribe: (deliver: (value: T) => void) => void,
  options: { loadingValue: T },
): BrowserValue<T> {
  subscribe(() => undefined);
  return () => options.loadingValue;
}
