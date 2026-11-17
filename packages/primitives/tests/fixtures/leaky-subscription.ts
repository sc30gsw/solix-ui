import type { Accessor } from "solid-js";
import { createBrowserValue } from "#/src/internal-browser-value.ts";

export function createLeakySubscription(): Accessor<boolean> {
  return createBrowserValue(
    (deliver) => {
      const list = window.matchMedia("(min-width: 1px)");
      deliver(list.matches);
      list.addEventListener("change", () => undefined);
    },
    { loadingValue: false },
  );
}
