import { createEffect, onCleanup } from "solid-js";

export function createCommand<Args extends unknown[], R>(
  run: (...args: Args) => R,
  idle: (...args: Args) => R,
): (...args: Args) => R {
  const owner = { live: false };
  createEffect(
    () => true,
    () => {
      owner.live = true;
    },
  );
  onCleanup(() => {
    owner.live = false;
  });
  return (...args) => (owner.live ? run(...args) : idle(...args));
}
