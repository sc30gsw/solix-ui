import { createEffect, createMemo, createSignal } from "solid-js";
import type { RefSetter } from "./types";

export type Same<C> = (left: C, right: C) => boolean;

export function createAttachment<C>(
  config: () => C | undefined,
  attach: (current: C) => () => void,
  same: Same<C> = Object.is,
): void {
  const current = createMemo<C | undefined>(config, {
    equals: (left, right) =>
      left === right || (left !== undefined && right !== undefined && same(left, right)),
  });
  createEffect(current, (value) => (value === undefined ? undefined : attach(value)));
}

export function createElementAttachment<E extends Element, C>(
  config: (element: E | undefined) => C | undefined,
  attach: (current: C) => () => void,
  same: Same<C> = Object.is,
): RefSetter<E> {
  const [element, setElement] = createSignal<E | undefined>(undefined);
  createAttachment(() => config(element()), attach, same);
  return (next) => {
    setElement(() => next);
  };
}
