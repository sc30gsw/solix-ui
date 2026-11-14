import { type Accessor, createMemo, createSignal, from, untrack } from "solid-js";
import { whereAllowed } from "./internal-browser-api";
import { sameConfig } from "./internal-equal";
import { watchEvents } from "./internal-listener";
import type { BrowserValue } from "./types";

export type Deliver<T> = (value: T) => void;

export type Keep = (teardown: () => void) => void;

export type Subscription<T, C> = (deliver: Deliver<T>, keep: Keep, config: C) => void;

export type BrowserValueOptions<T, C> = {
  loadingValue: T;
  config?: () => C;
  equals?: false | ((left: T, right: T) => boolean);
};

function branded<T>(read: Accessor<T>): BrowserValue<T> {
  return read as BrowserValue<T>;
}

export function createBrowserSignal<T>(
  initial: T,
): [value: BrowserValue<T>, deliver: (value: T) => void] {
  const [box, setBox] = createSignal<{ value: T }>(
    { value: initial },
    { equals: (left, right) => sameConfig(left.value, right.value) },
  );
  return [
    branded(() => box().value),
    (value) => {
      setBox({ value });
    },
  ];
}

export function mapBrowserValue<S, T>(
  source: BrowserValue<S>,
  project: (value: S) => T,
): BrowserValue<T> {
  return branded(() => project(source()));
}

export function createClientMemo<T>(compute: () => T, loadingValue: T): Accessor<T> {
  return createMemo<T>(compute, { ssrSource: "client", loadingValue });
}

export function createBrowserValue<T, C = undefined>(
  subscribe: Subscription<T, C>,
  options: BrowserValueOptions<T, C>,
): BrowserValue<T> {
  const config = createMemo<C | undefined>(() => options.config?.(), { equals: sameConfig });
  const value = createMemo<T>(
    () => {
      const current = config() as C;
      return from<T>((deliver) => {
        const teardowns: (() => void)[] = [];
        const stop = () => {
          for (const teardown of teardowns.splice(0).reverse()) teardown();
        };
        untrack(() =>
          whereAllowed(
            () => subscribe(deliver, (teardown) => teardowns.push(teardown), current),
            () => deliver(options.loadingValue),
            stop,
          ),
        );
        return stop;
      });
    },
    {
      ssrSource: "client",
      loadingValue: options.loadingValue,
      equals: options.equals ?? sameConfig,
    },
  );
  return branded(value);
}

export function readOn<T, R extends EventTarget, C = undefined>(
  target: (config: C) => R | null | undefined,
  types: readonly string[],
  read: (target: R, config: C) => T,
  options?: { passive?: boolean },
): Subscription<T, C> {
  return (deliver, keep, config) => {
    const resolved = target(config);
    if (!resolved) return;
    const deliverRead = () => deliver(read(resolved, config));
    deliverRead();
    for (const type of types) keep(watchEvents(resolved, type, deliverRead, options));
  };
}
