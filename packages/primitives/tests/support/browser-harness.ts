import { createEffect, createRoot, flush as flushSolid } from "solid-js";
import { afterEach, beforeEach, expect } from "vite-plus/test";
import { propertyRunsGoing } from "../../../../tests/support/properties.ts";
import {
  openSolidDiagnosticsGate,
  type SolidDiagnosticsGate,
  solidDevelopmentBuildLoaded,
} from "../../../../tests/support/solid-diagnostics.ts";
import type { EventOf } from "#/src/internal-listener.ts";
import type { RefSetter } from "#/src/types.ts";
import {
  eventHandlerProperty,
  listenerMethods,
  observers,
  timers,
} from "#/tests/support/browser-resources.ts";

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
export type Attachments = { listened: string[]; observed: string[]; removed: string[] };
type ObserverClass = new (callback: (...args: unknown[]) => void, ...rest: unknown[]) => object;

const browserGlobals = globalThis as unknown as Record<string, unknown>;
const listening = EventTarget.prototype as unknown as Record<string, unknown>;
const addListener = listening[listenerMethods.add] as EventTarget["addEventListener"];
const removeListener = listening[listenerMethods.remove] as EventTarget["removeEventListener"];
const returnedFunctionsWrappedToDepth = 2;

const liveListeners = new Set<Listener>();
const liveTimers = new Map<string, string>();
const liveObservations = new Map<object, Set<Node>>();
const liveHandlers = new Map<EventTarget, Set<string>>();
const disposers: (() => void)[] = [];
const recorders: (() => void)[] = [];
const scope = { depth: 0 };
const journals = new Set<Attachments>();
const diagnostics: { gate?: SolidDiagnosticsGate } = {};
const concurrentGates = new WeakMap<object, SolidDiagnosticsGate>();

function diagnosticsRaised(task?: object): string[] {
  if (task !== undefined) {
    const concurrent = concurrentGates.get(task);
    if (concurrent !== undefined) {
      concurrentGates.delete(task);
      return concurrent.finishDescribed();
    }
  }
  const raised = diagnostics.gate?.finishDescribed() ?? [];
  diagnostics.gate = undefined;
  return raised;
}

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
    for (const journal of journals) journal.listened.push(type);
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
    for (const journal of journals) journal.removed.push(type);
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
    for (const journal of journals) journal.observed.push(name);
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
    if (liveObservations.delete(this)) {
      for (const journal of journals) journal.removed.push(name);
    }
  };
}

function recordHandlers(holder: object): void {
  for (const name of Object.getOwnPropertyNames(holder)) {
    const descriptor = Object.getOwnPropertyDescriptor(holder, name);
    const set: unknown = Reflect.get(descriptor ?? {}, "set");
    if (
      !eventHandlerProperty.test(name) ||
      typeof set !== "function" ||
      !descriptor?.configurable
    ) {
      continue;
    }
    Object.defineProperty(holder, name, {
      ...descriptor,
      set(this: EventTarget, handler: unknown) {
        Reflect.apply(set, this, [handler]);
        const names = liveHandlers.get(this) ?? new Set<string>();
        if (handler === null || handler === undefined) names.delete(name);
        else if (inScope()) names.add(name);
        liveHandlers.set(this, names);
      },
    });
  }
}

for (const holder of [
  HTMLElement.prototype,
  SVGElement.prototype,
  Element.prototype,
  Document.prototype,
  Window.prototype,
  window,
]) {
  recordHandlers(holder);
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
    ...[...liveHandlers].flatMap(([target, names]) =>
      [...names].map((name) => `an ${name} handler on ${target.constructor.name}`),
    ),
  ];
}

function startRecording(task?: { concurrent?: boolean }): void {
  liveListeners.clear();
  liveTimers.clear();
  liveObservations.clear();
  liveHandlers.clear();
  if (task?.concurrent === true) {
    concurrentGates.set(task, openSolidDiagnosticsGate());
    return;
  }
  diagnostics.gate = openSolidDiagnosticsGate({ exclusive: true });
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

export function mountOn<E extends Element>(create: () => RefSetter<E>, element: E): RefSetter<E> {
  const ref = mount(create);
  ref(element);
  flush();
  return ref;
}

export function record<T extends EventTarget, K extends string>(
  target: T,
  type: K,
  capture = false,
): EventOf<T, K>[] {
  const seen: EventOf<T, K>[] = [];
  const listener = (event: Event) => {
    seen.push(event as EventOf<T, K>);
  };
  addListener.call(target, type, listener, capture);
  recorders.push(() => removeListener.call(target, type, listener, capture));
  return seen;
}

export async function attachmentsDuring<T>(
  run: () => T | Promise<T>,
): Promise<Attachments & { result: T }> {
  const journal: Attachments = { listened: [], observed: [], removed: [] };
  journals.add(journal);
  try {
    const result = await run();
    return { ...journal, result };
  } finally {
    journals.delete(journal);
  }
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

beforeEach(({ task }) => {
  expect(solidDevelopmentBuildLoaded(), "the browser project runs Solid's development build").toBe(
    true,
  );
  startRecording(task);
});

afterEach(({ task }) => {
  const propertyRunsLeft = propertyRunsGoing(task);
  unmount();
  for (const remove of recorders.splice(0)) remove();
  document.body.replaceChildren();
  expect(diagnosticsRaised(task), "a primitive raised a Solid development diagnostic").toEqual([]);
  expect(
    leftAfterDispose(),
    "a primitive left a listener, timer or observer behind after its owner was disposed",
  ).toEqual([]);
  expect(
    propertyRunsLeft,
    "a run of a generated property was still going when its test ended",
  ).toBe(0);
});
