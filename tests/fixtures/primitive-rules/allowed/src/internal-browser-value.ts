import { createMemo, from } from "solid-js";
import type { BrowserValue } from "./types";

export function createBrowserMemo<T>(compute: () => T, loadingValue: T): () => T {
  return createMemo(compute, { ssrSource: "client", loadingValue });
}

function branded<T>(read: () => T): BrowserValue<T> {
  return read as BrowserValue<T>;
}

export function createBrowserValue<T, C>(
  subscribe: (deliver: (value: T) => void, config: C) => void,
  options: { loadingValue: T; config?: () => C },
): BrowserValue<T> {
  const value = createMemo(
    () =>
      from<T>((deliver) => {
        subscribe(deliver, options.config?.() as C);
        return () => undefined;
      }),
    { ssrSource: "client", loadingValue: options.loadingValue },
  );
  return branded(value);
}
