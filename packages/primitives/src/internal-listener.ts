import type { ListenerOptions } from "#/src/types.ts";

type EventMapOf<T> = T extends Window
  ? WindowEventMap
  : T extends Document
    ? DocumentEventMap
    : T extends SVGElement
      ? SVGElementEventMap
      : T extends MathMLElement
        ? MathMLElementEventMap
        : T extends Element | ShadowRoot
          ? HTMLElementEventMap
          : Record<string, Event>;

export type EventOf<T, K extends string> = K extends keyof EventMapOf<T> ? EventMapOf<T>[K] : Event;

export type Listener<E> = (event: E) => void;

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

function listen<T extends EventTarget, K extends string>(
  target: T,
  settings: ListenerSettings<K>,
  listener: Listener<EventOf<T, K>>,
  accepts: (event: Event) => boolean = () => true,
): () => void {
  const handle = (event: Event) => {
    if (accepts(event)) listener(event as EventOf<T, K>);
  };
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

export function watchEvents<T extends EventTarget, K extends string>(
  target: T,
  types: readonly K[],
  listener: Listener<EventOf<T, K>>,
  options?: { passive?: boolean },
): () => void {
  return disposeAll(
    types.map((type) =>
      listen<T, K>(
        target,
        { ...listenerSettings(type, true), passive: options?.passive },
        listener,
        (event) => event.bubbles || event.target === target,
      ),
    ),
  );
}

export function handleEvent<T extends EventTarget, K extends string>(
  target: T,
  type: K,
  listener: Listener<EventOf<T, K>>,
): () => void {
  return listen<T, K>(target, listenerSettings(type), listener, (event) => !event.defaultPrevented);
}

export function listenAsAsked<T extends EventTarget, K extends string>(
  target: T,
  settings: ListenerSettings<K>,
  listener: Listener<EventOf<T, K>>,
): () => void {
  return listen(target, settings, listener);
}
