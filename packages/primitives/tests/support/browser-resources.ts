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

export const observers = ["ResizeObserver", "IntersectionObserver", "MutationObserver"] as const;

export const browserOnlyGlobals = [
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
  ...browserOnlyGlobals,
  ...Object.values(listenerMethods),
  ...timers.flatMap(({ schedule, cancel }) => [schedule, cancel]),
  ...observers,
];
