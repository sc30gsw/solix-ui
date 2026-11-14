import { onCleanup } from "solid-js";

export function createCleanupInCommand(): () => void {
  return () => {
    onCleanup(() => undefined);
  };
}
