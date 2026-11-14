import { createEffect, createRoot, type DiagnosticCapture, flush, OBSERVE } from "solid-js";
import { afterEach, beforeEach, expect } from "vite-plus/test";
import { listenerMethods, observers, timers } from "./browser-resources";

type Listener = {
  target: EventTarget;
  type: string;
  listener: EventListenerOrEventListenerObject;
  capture: boolean;
};

type Schedule = (callback: unknown, ...rest: unknown[]) => unknown;
type Cancel = (id: unknown) => void;
type Observe = (this: object, target: Node, ...rest: unknown[]) => void;
type Unobserve = (this: object, target?: Node) => void;

const primitiveSource = /\/packages\/primitives\/src\//;
const framesEnoughToReachThePrimitive = 100;
const browserGlobals = globalThis as unknown as Record<string, unknown>;

const liveListeners = new Set<Listener>();
const liveTimers = new Map<string, string>();
const liveObservations = new Map<object, Set<Node>>();
const disposers: (() => void)[] = [];
let diagnostics: DiagnosticCapture | undefined;

Error.stackTraceLimit = framesEnoughToReachThePrimitive;

function calledByAPrimitive(): boolean {
  return primitiveSource.test(new Error().stack ?? "");
}

function capturesIn(options: unknown): boolean {
  if (typeof options === "boolean") return options;
  return typeof options === "object" && options !== null && "capture" in options
    ? Boolean(options.capture)
    : false;
}

function forget(registration: Listener): void {
  for (const live of liveListeners) {
    if (
      live.target === registration.target &&
      live.type === registration.type &&
      live.listener === registration.listener &&
      live.capture === registration.capture
    ) {
      liveListeners.delete(live);
    }
  }
}

const listening = EventTarget.prototype as unknown as Record<string, unknown>;
const addListener = listening[listenerMethods.add] as EventTarget["addEventListener"];
const removeListener = listening[listenerMethods.remove] as EventTarget["removeEventListener"];

listening[listenerMethods.add] = function (
  this: EventTarget,
  ...[type, listener, options]: Parameters<EventTarget["addEventListener"]>
) {
  addListener.call(this, type, listener, options);
  if (!listener || !calledByAPrimitive()) return;
  const registration = { target: this, type, listener, capture: capturesIn(options) };
  liveListeners.add(registration);
  if (typeof options !== "object") return;
  if (options.once) {
    addListener.call(this, type, () => forget(registration), {
      once: true,
      capture: registration.capture,
    });
  }
  options.signal?.addEventListener("abort", () => forget(registration), { once: true });
};

listening[listenerMethods.remove] = function (
  this: EventTarget,
  ...[type, listener, options]: Parameters<EventTarget["removeEventListener"]>
) {
  removeListener.call(this, type, listener, options);
  if (listener) forget({ target: this, type, listener, capture: capturesIn(options) });
};

for (const { schedule: scheduleName, cancel: cancelName, kind, firesOnce } of timers) {
  const schedule = browserGlobals[scheduleName] as Schedule | undefined;
  const cancel = browserGlobals[cancelName] as Cancel | undefined;
  if (!schedule || !cancel) continue;
  browserGlobals[scheduleName] = (callback: unknown, ...rest: unknown[]) => {
    if (typeof callback !== "function" || !calledByAPrimitive()) {
      return schedule.call(globalThis, callback, ...rest);
    }
    const key = { id: undefined as unknown };
    const id = schedule.call(
      globalThis,
      (...args: unknown[]) => {
        if (firesOnce) liveTimers.delete(`${kind} ${String(key.id)}`);
        callback(...args);
      },
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
  const observer = browserGlobals[name] as { prototype: Record<string, unknown> } | undefined;
  if (!observer) continue;
  const prototype = observer.prototype;
  const observe = prototype.observe as Observe;
  const unobserve = prototype.unobserve as Unobserve | undefined;
  const disconnect = prototype.disconnect as Unobserve;
  prototype.observe = function (this: object, target: Node, ...rest: unknown[]) {
    observe.call(this, target, ...rest);
    if (!calledByAPrimitive()) return;
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

export function mount<T>(create: () => T): T {
  const created = createRoot((dispose) => {
    disposers.push(dispose);
    return create();
  });
  flush();
  return created;
}

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
  if (type && listener) element.addEventListener(type, listener);
  document.body.append(element);
  return element;
}

export function unmount(): void {
  for (const dispose of disposers.splice(0).reverse()) dispose();
  flush();
}

beforeEach(() => {
  expect(OBSERVE, "the browser project runs Solid's development build").toBeDefined();
  liveListeners.clear();
  liveTimers.clear();
  liveObservations.clear();
  diagnostics = OBSERVE?.diagnostics.capture();
});

afterEach(() => {
  unmount();
  document.body.replaceChildren();
  const raised = (diagnostics?.stop() ?? []).map(
    ({ code, message }) => `${code}: ${message.split("\n")[0]}`,
  );
  expect(raised, "a primitive raised a Solid development diagnostic").toEqual([]);
  expect(
    leftAfterDispose(),
    "a primitive left a listener, timer or observer behind after its owner was disposed",
  ).toEqual([]);
});
