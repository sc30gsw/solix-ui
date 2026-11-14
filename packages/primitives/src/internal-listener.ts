import { createEffect, createMemo } from "solid-js";
import type { ListenerOptions } from "./types";

export type ListenerSettings = {
  type: string;
  capture: boolean;
  passive: boolean | undefined;
  once: boolean | undefined;
  signal: AbortSignal | undefined;
};

export function listenerSettings(
  type: string,
  options: ListenerOptions | undefined,
): ListenerSettings {
  if (typeof options === "object") {
    return {
      type,
      capture: options.capture ?? false,
      passive: options.passive,
      once: options.once,
      signal: options.signal,
    };
  }
  return {
    type,
    capture: options ?? false,
    passive: undefined,
    once: undefined,
    signal: undefined,
  };
}

export function sameSettings(left: ListenerSettings, right: ListenerSettings): boolean {
  return (
    left.type === right.type &&
    left.capture === right.capture &&
    left.passive === right.passive &&
    left.once === right.once &&
    left.signal === right.signal
  );
}

export function listen<T extends Event>(
  target: EventTarget,
  settings: ListenerSettings,
  listener: (event: T) => void,
): () => void {
  const handle = (event: Event) => {
    listener(event as T);
  };
  target.addEventListener(settings.type, handle, {
    capture: settings.capture,
    passive: settings.passive,
    once: settings.once,
    signal: settings.signal,
  });
  return () => target.removeEventListener(settings.type, handle, { capture: settings.capture });
}

export function createAttachment<C>(
  config: () => C | undefined,
  attach: (current: C) => () => void,
  same: (left: C, right: C) => boolean,
): void {
  const current = createMemo<C | undefined>(config, {
    equals: (left, right) =>
      left === right || (left !== undefined && right !== undefined && same(left, right)),
  });
  createEffect(current, (value) => (value === undefined ? undefined : attach(value)));
}
