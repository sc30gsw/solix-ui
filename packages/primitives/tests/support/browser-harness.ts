import {
  createEffect,
  createRoot,
  type DiagnosticCapture,
  flush as flushSolid,
  OBSERVE,
} from "solid-js";
import { afterEach, beforeEach, expect } from "vite-plus/test";
import type { RefSetter } from "../../src/types";
import { listenerMethods, observers, timers } from "./browser-resources";

type Listener = {
  target: EventTarget;
  type: string;
  listener: EventListenerOrEventListenerObject;
  capture: boolean;
  registered: EventListener;
};
type Schedule = (callback: unknown, ...rest: unknown[]) => unknown;
type Cancel = (id: unknown) => void;
type Observe = (this: object, target: Node, ...rest: unknown[]) => void;
type Unobserve = (this: object, target?: Node) => void;
type ObserverClass = new (callback: (...args: unknown[]) => void, ...rest: unknown[]) => object;

const browserGlobals = globalThis as unknown as Record<string, unknown>;
const listening = EventTarget.prototype as unknown as Record<string, unknown>;
const addListener = listening[listenerMethods.add] as EventTarget["addEventListener"];
const removeListener = listening[listenerMethods.remove] as EventTarget["removeEventListener"];
const returnedFunctionsWrappedToDepth = 2;

const liveListeners = new Set<Listener>();
const liveTimers = new Map<string, string>();
const liveObservations = new Map<object, Set<Node>>();
const disposers: (() => void)[] = [];
const recorders: (() => void)[] = [];
const scope = { depth: 0 };
let diagnostics: DiagnosticCapture | undefined;

function inScope(): boolean {
  return scope.depth > 0;
}

function attributed<Args extends unknown[], R>(
  run: (this: unknown, ...args: Args) => R,
): (this: unknown, ...args: Args) => R {
  return function (this: unknown, ...args: Args): R {
    scope.depth += 1;
    try {
      return run.apply(this, args);
    } finally {
      scope.depth -= 1;
    }
  };
}

function withFunctionsAttributed<T>(value: T, depth: number): T {
  if (typeof value === "function") {
    return attributed(value as (...args: unknown[]) => unknown) as T;
  }
  if (depth === 0 || typeof value !== "object" || value === null) return value;
  if (Array.isArray(value)) {
    const wrapped = value.map((member: unknown) => withFunctionsAttributed(member, depth - 1));
    return wrapped.some((member, index) => member !== value[index]) ? (wrapped as T) : value;
  }
  if (Object.getPrototypeOf(value) !== Object.prototype) return value;
  const entries = Object.entries(value);
  const wrapped = entries.map(([key, member]) => [key, withFunctionsAttributed(member, depth - 1)]);
  return wrapped.some(([, member], index) => member !== entries[index][1])
    ? (Object.fromEntries(wrapped) as T)
    : value;
}

function capturesIn(options: unknown): boolean {
  if (typeof options === "boolean") return options;
  return typeof options === "object" && options !== null && "capture" in options
    ? Boolean(options.capture)
    : false;
}

function liveListenerFor(
  target: EventTarget,
  type: string,
  listener: EventListenerOrEventListenerObject,
  capture: boolean,
): Listener | undefined {
  return [...liveListeners].find(
    (live) =>
      live.target === target &&
      live.type === type &&
      live.listener === listener &&
      live.capture === capture,
  );
}

function recordListeners(holder: Record<string, unknown>): void {
  const add = holder[listenerMethods.add] as EventTarget["addEventListener"];
  const remove = holder[listenerMethods.remove] as EventTarget["removeEventListener"];
  holder[listenerMethods.add] = function (
    this: EventTarget,
    ...[type, listener, options]: Parameters<EventTarget["addEventListener"]>
  ) {
    if (!listener || !inScope()) {
      add.call(this, type, listener, options);
      return;
    }
    const capture = capturesIn(options);
    if (liveListenerFor(this, type, listener, capture)) return;
    const once = typeof options === "object" && options.once === true;
    const registration: Listener = {
      target: this,
      type,
      listener,
      capture,
      registered: attributed(function (this: unknown, event: Event) {
        if (once) liveListeners.delete(registration);
        if (typeof listener === "function") listener.call(this, event);
        else listener.handleEvent(event);
      }),
    };
    liveListeners.add(registration);
    add.call(this, type, registration.registered, options);
    if (typeof options === "object" && options.signal) {
      addListener.call(options.signal, "abort", () => liveListeners.delete(registration), {
        once: true,
      });
    }
  };
  holder[listenerMethods.remove] = function (
    this: EventTarget,
    ...[type, listener, options]: Parameters<EventTarget["removeEventListener"]>
  ) {
    const live = listener ? liveListenerFor(this, type, listener, capturesIn(options)) : undefined;
    if (!live) {
      remove.call(this, type, listener, options);
      return;
    }
    liveListeners.delete(live);
    remove.call(this, type, live.registered, options);
  };
}

for (const holder of [listening, browserGlobals]) {
  if (Object.hasOwn(holder, listenerMethods.add)) recordListeners(holder);
}

for (const { schedule: scheduleName, cancel: cancelName, kind, firesOnce } of timers) {
  const schedule = browserGlobals[scheduleName] as Schedule | undefined;
  const cancel = browserGlobals[cancelName] as Cancel | undefined;
  if (!schedule || !cancel) continue;
  browserGlobals[scheduleName] = (callback: unknown, ...rest: unknown[]) => {
    if (typeof callback !== "function" || !inScope()) {
      return schedule.call(globalThis, callback, ...rest);
    }
    const key = { id: undefined as unknown };
    const id = schedule.call(
      globalThis,
      attributed((...args: unknown[]) => {
        if (firesOnce) liveTimers.delete(`${kind} ${String(key.id)}`);
        callback(...args);
      }),
      ...rest,
    );
    key.id = id;
    liveTimers.set(`${kind} ${String(id)}`, kind);
    return id;
  };
  browserGlobals[cancelName] = (id: unknown) => {
    liveTimers.delete(`${kind} ${String(id)}`);
    cancel.call(globalThis, id);
  };
}

for (const name of observers) {
  const Observer = browserGlobals[name] as ObserverClass | undefined;
  if (!Observer) continue;
  const prototype = Observer.prototype as Record<string, unknown>;
  const observe = prototype.observe as Observe;
  const unobserve = prototype.unobserve as Unobserve | undefined;
  const disconnect = prototype.disconnect as Unobserve;
  const AttributedObserver = class extends Observer {
    constructor(callback: (...args: unknown[]) => void, ...rest: unknown[]) {
      super(inScope() ? attributed(callback) : callback, ...rest);
    }
  };
  Object.defineProperty(AttributedObserver, "name", { value: name });
  browserGlobals[name] = AttributedObserver;
  prototype.observe = function (this: object, target: Node, ...rest: unknown[]) {
    observe.call(this, target, ...rest);
    if (!inScope()) return;
    liveObservations.set(this, (liveObservations.get(this) ?? new Set<Node>()).add(target));
  };
  if (unobserve) {
    prototype.unobserve = function (this: object, target?: Node) {
      unobserve.call(this, target);
      if (target) liveObservations.get(this)?.delete(target);
    };
  }
  prototype.disconnect = function (this: object) {
    disconnect.call(this);
    liveObservations.delete(this);
  };
}

function leftAfterDispose(): string[] {
  return [
    ...[...liveListeners].map(
      ({ target, type, capture }) =>
        `a ${type} listener${capture ? " in the capture phase" : ""} on ${target.constructor.name}`,
    ),
    ...[...liveTimers.values()].map((kind) => `a pending ${kind}`),
    ...[...liveObservations]
      .filter(([, observed]) => observed.size > 0)
      .map(([observer]) => `an observation by a ${observer.constructor.name}`),
  ];
}

function startRecording(): void {
  liveListeners.clear();
  liveTimers.clear();
  liveObservations.clear();
  diagnostics = OBSERVE?.diagnostics.capture();
}

function diagnosticsRaised(): string[] {
  return (diagnostics?.stop() ?? []).map(
    ({ code, message }) => `${code}: ${message.split("\n")[0]}`,
  );
}

export function mount<T>(create: () => T): T {
  return attributed(() => {
    const created = createRoot((dispose) => {
      disposers.push(dispose);
      return create();
    });
    flushSolid();
    return withFunctionsAttributed(created, returnedFunctionsWrappedToDepth);
  })();
}

export const flush = attributed((): void => {
  flushSolid();
});

export function watch<T>(read: () => T): T[] {
  const seen: T[] = [];
  createEffect(read, (value) => {
    seen.push(value);
  });
  return seen;
}

export function attached<E extends HTMLElement>(
  element: E,
  type?: string,
  listener?: (event: Event) => void,
): E {
  if (type && listener) addListener.call(element, type, listener);
  document.body.append(element);
  return element;
}

export function mountOn<E extends Element>(create: () => RefSetter<E>, element: E): RefSetter<E> {
  const ref = mount(create);
  ref(element);
  flush();
  return ref;
}

export function record<K extends keyof WindowEventMap>(
  target: EventTarget,
  type: K,
): WindowEventMap[K][] {
  const seen: WindowEventMap[K][] = [];
  const listener = (event: Event) => {
    seen.push(event as WindowEventMap[K]);
  };
  addListener.call(target, type, listener);
  recorders.push(() => removeListener.call(target, type, listener));
  return seen;
}

export function unmount(): void {
  for (const dispose of disposers.splice(0).reverse()) dispose();
  flushSolid();
}

export function reportAfterDispose(): string[] {
  unmount();
  const report = [...diagnosticsRaised(), ...leftAfterDispose()];
  startRecording();
  return report;
}

beforeEach(() => {
  expect(OBSERVE, "the browser project runs Solid's development build").toBeDefined();
  startRecording();
});

afterEach(() => {
  unmount();
  for (const remove of recorders.splice(0)) remove();
  document.body.replaceChildren();
  expect(diagnosticsRaised(), "a primitive raised a Solid development diagnostic").toEqual([]);
  expect(
    leftAfterDispose(),
    "a primitive left a listener, timer or observer behind after its owner was disposed",
  ).toEqual([]);
});
