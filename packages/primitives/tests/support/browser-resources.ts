import { observerNames } from "#/src/internal-dom-observer.ts";

export type Timer = { schedule: string; cancel: string; kind: string; firesOnce: boolean };

export const listenerMethods = { add: "addEventListener", remove: "removeEventListener" } as const;

export const timers: readonly Timer[] = [
  { schedule: "setTimeout", cancel: "clearTimeout", kind: "timeout", firesOnce: true },
  { schedule: "setInterval", cancel: "clearInterval", kind: "interval", firesOnce: false },
  {
    schedule: "requestAnimationFrame",
    cancel: "cancelAnimationFrame",
    kind: "animation frame",
    firesOnce: true,
  },
  {
    schedule: "requestIdleCallback",
    cancel: "cancelIdleCallback",
    kind: "idle callback",
    firesOnce: true,
  },
];

export const observers = observerNames;

export const eventHandlerProperty = /^on[a-z]+$/;

export const trappedOnTheServer = [
  "window",
  "document",
  "navigator",
  "location",
  "history",
  "screen",
  "localStorage",
  "sessionStorage",
  "matchMedia",
  "getComputedStyle",
  "HTMLElement",
] as const;

export const everyBrowserResource: readonly string[] = [
  ...trappedOnTheServer,
  ...Object.values(listenerMethods),
  ...timers.flatMap(({ schedule, cancel }) => [schedule, cancel]),
  ...observers,
];
