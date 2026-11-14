import type * as Primitives from "../../src/index";

type Library = typeof Primitives;

export type Primitive = Extract<keyof Library, `create${string}`>;

export type ServerCase<F> = {
  create: (primitive: F) => unknown;
  read?: (returned: never) => unknown;
  expected?: unknown;
  ref?: (returned: never) => Primitives.RefSetter<HTMLElement>;
  commands?: (returned: never) => void;
};

function serverCase<F, R>(cases: {
  create: (primitive: F) => R;
  read?: (returned: R) => unknown;
  expected?: unknown;
  ref?: (returned: R) => Primitives.RefSetter<HTMLElement>;
  commands?: (returned: R) => void;
}): ServerCase<F> {
  return cases;
}

export function serialized(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) => {
    if (item instanceof Map || item instanceof Set) return [...item];
    return item === undefined ? "undefined" : item;
  });
}

export const serverCases: { [K in Primitive]: ServerCase<Library[K]> } = {
  createClickOutside: serverCase({
    create: (createClickOutside) => [
      createClickOutside(() => undefined),
      createClickOutside(
        () => undefined,
        ["mousedown"],
        () => [undefined],
      ),
    ],
    ref: ([ref]) => ref,
  }),
  createCounter: serverCase({
    create: (createCounter) => createCounter(11, { min: 0, max: 10 }),
    read: ([count]) => count(),
    expected: 10,
    commands: ([, handlers]) => {
      handlers.decrement();
      handlers.increment();
      handlers.set(3);
      handlers.reset();
    },
  }),
  createDisclosure: serverCase({
    create: (createDisclosure) => createDisclosure(true),
    read: ([opened]) => opened(),
    expected: true,
    commands: ([, handlers]) => {
      handlers.close();
      handlers.open();
      handlers.toggle();
      handlers.set(false);
    },
  }),
  createElementSize: serverCase({
    create: (createElementSize) => createElementSize({ box: "border-box" }),
    read: ({ width, height }) => [width(), height()],
    expected: [0, 0],
    ref: ({ ref }) => ref,
  }),
  createEventListener: serverCase({
    create: (createEventListener) =>
      createEventListener(
        "click",
        () => undefined,
        () => ({ capture: true }),
      ),
    ref: (ref) => ref,
  }),
  createFocusReturn: serverCase({
    create: (createFocusReturn) => createFocusReturn({ opened: true, surface: () => undefined }),
    commands: (returnFocus) => returnFocus(),
  }),
  createFocusTrap: serverCase({
    create: (createFocusTrap) => createFocusTrap(() => false),
    ref: (ref) => ref,
  }),
  createHotkeys: serverCase({
    create: (createHotkeys) => createHotkeys(() => [["mod+K", () => undefined]]),
  }),
  createHover: serverCase({
    create: (createHover) => createHover(),
    read: ({ hovered }) => hovered(),
    expected: false,
    ref: ({ ref }) => ref,
  }),
  createInViewport: serverCase({
    create: (createInViewport) => createInViewport(),
    read: ({ inViewport }) => inViewport(),
    expected: false,
    ref: ({ ref }) => ref,
  }),
  createInputState: serverCase({
    create: (createInputState) => createInputState("typed"),
    read: ([value]) => value(),
    expected: "typed",
    commands: ([, onChange]) => onChange("changed"),
  }),
  createIntersection: serverCase({
    create: (createIntersection) => createIntersection(() => ({ threshold: [0, 1] })),
    read: ({ entry }) => entry()?.isIntersecting ?? null,
    expected: null,
    ref: ({ ref }) => ref,
  }),
  createListState: serverCase({
    create: (createListState) => createListState(() => [1, 2]),
    read: ([list]) => list(),
    expected: [1, 2],
    commands: ([, handlers]) => {
      handlers.append(3);
      handlers.reorder({ from: 0, to: 1 });
      handlers.remove(0);
    },
  }),
  createMap: serverCase({
    create: (createMap) => createMap([["key", 1]]),
    read: (map) => map(),
    expected: new Map([["key", 1]]),
    commands: (map) => {
      map().set("other", 2);
    },
  }),
  createMediaQuery: serverCase({
    create: (createMediaQuery) => [
      createMediaQuery("(min-width: 1px)"),
      createMediaQuery(() => "(min-width: 1px)", true),
    ],
    read: ([withoutInitial, withInitial]) => [withoutInitial(), withInitial()],
    expected: [false, true],
  }),
  createMutationObserver: serverCase({
    create: (createMutationObserver) =>
      createMutationObserver(
        () => undefined,
        () => ({ childList: true }),
      ),
    ref: (ref) => ref,
  }),
  createMutationObserverTarget: serverCase({
    create: (createMutationObserverTarget) =>
      createMutationObserverTarget(
        () => undefined,
        { attributes: true },
        () => document.documentElement,
      ),
  }),
  createPrevious: serverCase({
    create: (createPrevious) => createPrevious(() => "now"),
    read: (previous) => previous(),
    expected: undefined,
  }),
  createQueue: serverCase({
    create: (createQueue) => createQueue({ initialValues: [1, 2, 3], limit: 2 }),
    read: ({ state, queue }) => [state(), queue()],
    expected: [[1, 2], [3]],
    commands: ({ add, update, cleanQueue }) => {
      add(4);
      update((items) => items.slice(1));
      cleanQueue();
    },
  }),
  createResizeObserver: serverCase({
    create: (createResizeObserver) => createResizeObserver(),
    read: ([, rect]) => rect(),
    expected: { x: 0, y: 0, width: 0, height: 0, top: 0, left: 0, bottom: 0, right: 0 },
    ref: ([ref]) => ref,
  }),
  createSet: serverCase({
    create: (createSet) => createSet(["member"]),
    read: (set) => set(),
    expected: new Set(["member"]),
    commands: (set) => {
      set().add("other");
    },
  }),
  createSetState: serverCase({
    create: (createSetState) => createSetState({ page: 1 }),
    read: ([state]) => state(),
    expected: { page: 1 },
    commands: ([, setState]) => setState({ page: 2 }),
  }),
  createStateHistory: serverCase({
    create: (createStateHistory) => createStateHistory("first"),
    read: ([value, , { history, current }]) => [value(), history(), current()],
    expected: ["first", ["first"], 0],
    commands: ([, handlers]) => {
      handlers.set("second");
      handlers.back();
      handlers.forward();
      handlers.reset();
    },
  }),
  createToggle: serverCase({
    create: (createToggle) => createToggle(["light", "dark"]),
    read: ([value]) => value(),
    expected: "light",
    commands: ([, toggle]) => toggle(),
  }),
  createUncontrolled: serverCase({
    create: (createUncontrolled) =>
      createUncontrolled({ defaultValue: "default", finalValue: "final" }),
    read: ([value, , controlled]) => [value(), controlled()],
    expected: ["default", false],
    commands: ([, setValue]) => setValue("changed"),
  }),
  createValidatedState: serverCase({
    create: (createValidatedState) =>
      createValidatedState("ab", (text: string) => text.length > 2, true),
    read: ([state]) => [state.value(), state.lastValidValue(), state.valid()],
    expected: ["ab", undefined, true],
    commands: ([, setValue]) => setValue("abc"),
  }),
  createWindowEvent: serverCase({
    create: (createWindowEvent) =>
      createWindowEvent(
        "resize",
        () => undefined,
        () => ({ passive: true }),
      ),
  }),
};
