import { createMemo, from } from "solid-js";
import type { BrowserValue } from "./types";

export function createClientMemo<T>(compute: () => T, loadingValue: T): () => T {
  return createMemo(compute, { ssrSource: "client", loadingValue });
}

export function createBrowserValue<T, C>(
  subscribe: (deliver: (value: T) => void, config: C) => void,
  options: { loadingValue: T; config?: () => C },
): BrowserValue<T> {
  return createMemo(
    () =>
      from<T>((deliver) => {
        subscribe(deliver, options.config?.() as C);
        return () => undefined;
      }),
    { ssrSource: "client", loadingValue: options.loadingValue },
  );
}
