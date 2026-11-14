import { type Accessor, createSignal, onCleanup } from "solid-js";
import type { RefSetter } from "./types";

export function createElementSlot<E extends Element>(): [
  element: Accessor<E | undefined>,
  ref: RefSetter<E>,
] {
  const [element, setElement] = createSignal<E | undefined>(undefined);
  const state = { live: true };
  onCleanup(() => {
    state.live = false;
  });
  return [
    element,
    (next) => {
      if (state.live) setElement(() => next);
    },
  ];
}
