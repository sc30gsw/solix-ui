import { type Accessor, createEffect } from "solid-js";

export function createLeakyListener(target: Accessor<EventTarget | undefined>): void {
  createEffect(target, (current) => {
    current?.addEventListener("resize", () => undefined);
  });
}
