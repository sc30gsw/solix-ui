import { createEffect, createMemo, createSignal } from "solid-js";
import { createBrowserSignal } from "./internal-browser-value";
import { type LiveConfig, sameValue } from "./internal-equal";
import type { BrowserValue, RefSetter } from "./types";

export type Attach<Args extends unknown[]> = (...args: Args) => () => void;

export function createAttachment(attach: Attach<[]>): void;
export function createAttachment<C>(
  attach: Attach<[config: C]>,
  config: LiveConfig<C | undefined>,
): void;
export function createAttachment<C>(
  ...args: [attach: Attach<[]>] | [attach: Attach<[config: C]>, config: LiveConfig<C | undefined>]
): void {
  if (args.length === 1) {
    createEffect(
      () => undefined,
      () => args[0](),
    );
    return;
  }
  const current = createMemo<C | undefined>(args[1], { equals: sameValue });
  createEffect(current, (value) => (value === undefined ? undefined : args[0](value)));
}

export function createElementAttachment<E extends Element, C>(
  config: LiveConfig<C | undefined, [element: E | undefined]>,
  attach: Attach<[current: C]>,
): RefSetter<E> {
  const [element, setElement] = createSignal<E | undefined>(undefined);
  createAttachment(attach, () => config(element()));
  return (next) => {
    setElement(() => next);
  };
}

export function createElementValue<E extends Element, T, C = undefined>(
  initial: T,
  attach: Attach<[element: E, config: C, deliver: (value: T) => void]>,
  config?: LiveConfig<C>,
): [ref: RefSetter<E>, value: BrowserValue<T>] {
  const [value, deliver] = createBrowserSignal(initial);
  const ref = createElementAttachment<E, { element: E; config: C | undefined }>(
    (element) => element && { element, config: config?.() },
    (current) => {
      const detach = attach(current.element, current.config as C, deliver);
      return () => {
        detach();
        deliver(initial);
      };
    },
  );
  return [ref, value];
}
