import type { ListenerOptions } from "./types";

type EventMapOf<T> = T extends Window
  ? WindowEventMap
  : T extends Document
    ? DocumentEventMap
    : T extends SVGElement
      ? SVGElementEventMap
      : T extends MathMLElement
        ? MathMLElementEventMap
        : T extends Element
          ? HTMLElementEventMap
          : Record<string, Event>;

export type EventOf<T, K extends string> = K extends keyof EventMapOf<T> ? EventMapOf<T>[K] : Event;

export type ListenerSettings<K extends string = string> = {
  type: K;
  capture: boolean;
  passive: boolean | undefined;
  once: boolean | undefined;
  signal: AbortSignal | undefined;
};

export function listenerSettings<K extends string>(
  type: K,
  options?: ListenerOptions,
): ListenerSettings<K> {
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

export function listen<T extends EventTarget, K extends string>(
  target: T,
  settings: ListenerSettings<K>,
  listener: (event: EventOf<T, K>) => void,
): () => void {
  const handle = (event: Event) => listener(event as EventOf<T, K>);
  target.addEventListener(settings.type, handle, {
    capture: settings.capture,
    passive: settings.passive,
    once: settings.once,
    signal: settings.signal,
  });
  return () => target.removeEventListener(settings.type, handle, { capture: settings.capture });
}

export function disposeAll(disposers: readonly (() => void)[]): () => void {
  return () => {
    for (const dispose of disposers) dispose();
  };
}
