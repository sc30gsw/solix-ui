import type * as Primitives from "../../src/index";

type Library = typeof Primitives;

export type Primitive = Extract<keyof Library, `create${string}`>;

export type ServerCase<F> = {
  create: (primitive: F) => unknown;
  read?: (returned: never) => unknown;
  expected?: unknown;
  ref?: (returned: never) => Primitives.RefSetter<HTMLElement>;
  stateCommands?: (returned: never) => void;
  afterStateCommands?: unknown;
  browserCommands?: (returned: never) => void;
};

function serverCase<F, R>(cases: {
  create: (primitive: F) => R;
  read?: (returned: R) => unknown;
  expected?: unknown;
  ref?: (returned: R) => Primitives.RefSetter<HTMLElement>;
  stateCommands?: (returned: R) => void;
  afterStateCommands?: unknown;
  browserCommands?: (returned: R) => void;
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
  createActiveElement: serverCase({
    create: (createActiveElement) => createActiveElement({ deep: () => false }),
    read: (active) => active()?.localName ?? null,
    expected: null,
  }),
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
    stateCommands: ([, handlers]) => handlers.decrement(),
    afterStateCommands: 9,
  }),
  createDisclosure: serverCase({
    create: (createDisclosure) => createDisclosure(true),
    read: ([opened]) => opened(),
    expected: true,
    stateCommands: ([, handlers]) => handlers.close(),
    afterStateCommands: false,
  }),
  createDocumentVisibility: serverCase({
    create: (createDocumentVisibility) => createDocumentVisibility(),
    read: (visibility) => visibility(),
    expected: "visible",
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
    browserCommands: (returnFocus) => returnFocus(),
  }),
  createFocusTrap: serverCase({
    create: (createFocusTrap) => createFocusTrap(() => false),
    ref: (ref) => ref,
  }),
  createFocusWithin: serverCase({
    create: (createFocusWithin) => createFocusWithin({ onFocus: () => undefined }),
    read: ({ focused }) => focused(),
    expected: false,
    ref: ({ ref }) => ref,
  }),
  createHeadroom: serverCase({
    create: (createHeadroom) => createHeadroom({ fixedAt: () => 40, onFix: () => undefined }),
    read: ({ pinned, scrollProgress }) => [pinned(), scrollProgress()],
    expected: [true, 1],
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
    stateCommands: ([, onChange]) => onChange("changed"),
    afterStateCommands: "changed",
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
    stateCommands: ([, handlers]) => handlers.append(3),
    afterStateCommands: [1, 2, 3],
  }),
  createMap: serverCase({
    create: (createMap) => createMap([["key", 1]]),
    read: (map) => map(),
    expected: new Map([["key", 1]]),
    stateCommands: (map) => {
      map().set("other", 2);
    },
    afterStateCommands: new Map([
      ["key", 1],
      ["other", 2],
    ]),
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
  createPageLeave: serverCase({
    create: (createPageLeave) => createPageLeave(() => undefined),
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
    stateCommands: ({ add }) => add(4),
    afterStateCommands: [
      [1, 2],
      [3, 4],
    ],
  }),
  createResizeObserver: serverCase({
    create: (createResizeObserver) => createResizeObserver(),
    read: ([, rect]) => rect(),
    expected: { x: 0, y: 0, width: 0, height: 0, top: 0, left: 0, bottom: 0, right: 0 },
    ref: ([ref]) => ref,
  }),
  createScrollDirection: serverCase({
    create: (createScrollDirection) => createScrollDirection(),
    read: (direction) => direction(),
    expected: "unknown",
  }),
  createSet: serverCase({
    create: (createSet) => createSet(["member"]),
    read: (set) => set(),
    expected: new Set(["member"]),
    stateCommands: (set) => {
      set().add("other");
    },
    afterStateCommands: new Set(["member", "other"]),
  }),
  createSetState: serverCase({
    create: (createSetState) => createSetState({ page: 1 }),
    read: ([state]) => state(),
    expected: { page: 1 },
    stateCommands: ([, setState]) => setState({ page: 2 }),
    afterStateCommands: { page: 2 },
  }),
  createStateHistory: serverCase({
    create: (createStateHistory) => createStateHistory("first"),
    read: ([value, , { history, current }]) => [value(), history(), current()],
    expected: ["first", ["first"], 0],
    stateCommands: ([, handlers]) => handlers.set("second"),
    afterStateCommands: ["second", ["first", "second"], 1],
  }),
  createTextSelection: serverCase({
    create: (createTextSelection) => createTextSelection(),
    read: (selection) => selection()?.type ?? null,
    expected: null,
  }),
  createToggle: serverCase({
    create: (createToggle) => createToggle(["light", "dark"]),
    read: ([value]) => value(),
    expected: "light",
    stateCommands: ([, toggle]) => toggle(),
    afterStateCommands: "dark",
  }),
  createUncontrolled: serverCase({
    create: (createUncontrolled) =>
      createUncontrolled({ defaultValue: "default", finalValue: "final" }),
    read: ([value, , controlled]) => [value(), controlled()],
    expected: ["default", false],
    stateCommands: ([, setValue]) => setValue("changed"),
    afterStateCommands: ["changed", false],
  }),
  createValidatedState: serverCase({
    create: (createValidatedState) =>
      createValidatedState("ab", (text: string) => text.length > 2, true),
    read: ([state]) => [state.value(), state.lastValidValue(), state.valid()],
    expected: ["ab", undefined, true],
    stateCommands: ([, setValue]) => setValue("abc"),
    afterStateCommands: ["abc", "abc", true],
  }),
  createViewportSize: serverCase({
    create: (createViewportSize) => createViewportSize(),
    read: ({ width, height }) => [width(), height()],
    expected: [0, 0],
  }),
  createWindowEvent: serverCase({
    create: (createWindowEvent) =>
      createWindowEvent(
        "resize",
        () => undefined,
        () => ({ passive: true }),
      ),
  }),
  createWindowScroll: serverCase({
    create: (createWindowScroll) => createWindowScroll(),
    read: ([position]) => position(),
    expected: { x: 0, y: 0 },
    browserCommands: ([, scrollTo]) => scrollTo({ y: 10 }),
  }),
};
