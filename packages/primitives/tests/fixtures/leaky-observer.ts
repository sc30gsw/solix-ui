import { createEffect } from "solid-js";

export function createLeakyObserver(target: Element): void {
  createEffect(
    () => target,
    (observed) => {
      new ResizeObserver(() => undefined).observe(observed);
    },
  );
}
