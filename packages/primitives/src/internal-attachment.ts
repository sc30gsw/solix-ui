import { createEffect, createMemo, createSignal } from "solid-js";
import { createBrowserSignal } from "./internal-browser-value";
import { sameConfig } from "./internal-equal";
import { type EventOf, handleEvent, listen, type ListenerSettings } from "./internal-listener";
import type { BrowserValue, RefSetter } from "./types";

export function createAttachment<C>(
  config: () => C | undefined,
  attach: (current: C) => () => void,
): void {
  const current = createMemo<C | undefined>(config, { equals: sameConfig });
  createEffect(current, (value) => (value === undefined ? undefined : attach(value)));
}

export function createElementAttachment<E extends Element, C>(
  config: (element: E | undefined) => C | undefined,
  attach: (current: C) => () => void,
): RefSetter<E> {
  const [element, setElement] = createSignal<E | undefined>(undefined);
  createAttachment(() => config(element()), attach);
  return (next) => {
    setElement(() => next);
  };
}

export function createElementValue<E extends Element, T, C = undefined>(
  initial: T,
  attach: (element: E, config: C, deliver: (value: T) => void) => () => void,
  config?: () => C,
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

export function createTargetListener<T extends EventTarget, K extends string>(
  target: () => T,
  settings: () => ListenerSettings<K>,
  listener: (event: EventOf<T, K>) => void,
): void {
  createAttachment(settings, (current) => listen(target(), current, listener));
}

export function createWindowHandler<K extends string>(
  type: K,
  listener: (event: EventOf<Window, K>) => void,
): void {
  createAttachment(
    () => type,
    (current) => handleEvent(window, current, listener),
  );
}
