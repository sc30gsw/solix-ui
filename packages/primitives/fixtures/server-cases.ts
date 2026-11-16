import type * as Primitives from "../src/index";
import type { BrowserValuePrimitive } from "./primitive-kinds";

type Library = typeof Primitives;

export type Primitive = Extract<keyof Library, `create${string}`>;

export type Called = (name: string) => () => void;

export type Started = {
  returned: unknown;
  value?: { read: () => unknown; expected: unknown };
  ref?: Primitives.RefSetter<HTMLElement>;
  stateCommands?: { run: () => void; after: unknown };
  browserCommands?: () => void;
};

export type Parts = { stateCommands: boolean; browserCommands: boolean };

export type ServerCase<F> = { has: Parts; start: (primitive: F, called: Called) => Started };

export type ValueCase<F> = {
  has: Parts;
  start: (primitive: F, called: Called) => Started & Required<Pick<Started, "value">>;
};

type Spec<F, R> = {
  create: (primitive: F, called: Called) => R;
  ref?: (returned: R) => Primitives.RefSetter<HTMLElement>;
  stateCommands?: { run: (returned: R) => void; after: unknown };
  browserCommands?: (returned: R) => void;
};

type ValueSpec<R> = { read: (returned: R) => unknown; expected: unknown };

function started<F, R>(spec: Spec<F, R>, returned: R): Started {
  const { ref, stateCommands, browserCommands } = spec;
  return {
    returned,
    ref: ref?.(returned),
    stateCommands: stateCommands && {
      run: () => stateCommands.run(returned),
      after: stateCommands.after,
    },
    browserCommands: browserCommands && (() => browserCommands(returned)),
  };
}

function partsOf<F, R>(spec: Spec<F, R>): Parts {
  return {
    stateCommands: spec.stateCommands !== undefined,
    browserCommands: spec.browserCommands !== undefined,
  };
}

function serverCase<F, R>(spec: Spec<F, R>): ServerCase<F> {
  return {
    has: partsOf(spec),
    start: (primitive, called) => started(spec, spec.create(primitive, called)),
  };
}

function valueCase<F, R>(spec: Spec<F, R> & { value: ValueSpec<R> }): ValueCase<F> {
  return {
    has: partsOf(spec),
    start: (primitive, called) => {
      const returned = spec.create(primitive, called);
      return {
        ...started(spec, returned),
        value: { read: () => spec.value.read(returned), expected: spec.value.expected },
      };
    },
  };
}

export function serialized(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) => {
    if (item instanceof Map || item instanceof Set) return [...item];
    return item === undefined ? "undefined" : item;
  });
}

export const emptyRect = { x: 0, y: 0, width: 0, height: 0, top: 0, left: 0, bottom: 0, right: 0 };

const cases = {
  createActiveElement: valueCase({
    create: (createActiveElement) => createActiveElement({ deep: () => false }),
    value: {
      read: (active) => active()?.localName ?? null,
      expected: null,
    },
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
  createCounter: valueCase({
    create: (createCounter) => createCounter(11, { min: 0, max: 10 }),
    value: {
      read: ([count]) => count(),
      expected: 10,
    },
    stateCommands: {
      run: ([, handlers]) => handlers.decrement(),
      after: 9,
    },
  }),
  createDisclosure: valueCase({
    create: (createDisclosure) => createDisclosure(true),
    value: {
      read: ([opened]) => opened(),
      expected: true,
    },
    stateCommands: {
      run: ([, handlers]) => handlers.close(),
      after: false,
    },
  }),
  createDocumentVisibility: valueCase({
    create: (createDocumentVisibility) => createDocumentVisibility(),
    value: {
      read: (visibility) => visibility(),
      expected: "visible",
    },
  }),
  createElementSize: valueCase({
    create: (createElementSize) => createElementSize({ box: "border-box" }),
    value: {
      read: ({ width, height }) => [width(), height()],
      expected: [0, 0],
    },
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
  createFocusWithin: valueCase({
    create: (createFocusWithin) => createFocusWithin({ onFocus: () => undefined }),
    value: {
      read: ({ focused }) => focused(),
      expected: false,
    },
    ref: ({ ref }) => ref,
  }),
  createHeadroom: valueCase({
    create: (createHeadroom, called) =>
      createHeadroom({
        fixedAt: () => 40,
        onPin: called("pin"),
        onFix: called("fix"),
        onRelease: called("release"),
      }),
    value: {
      read: ({ pinned, scrollProgress }) => [pinned(), scrollProgress()],
      expected: [true, 1],
    },
  }),
  createHotkeys: serverCase({
    create: (createHotkeys) => createHotkeys(() => [["mod+K", () => undefined]]),
  }),
  createHover: valueCase({
    create: (createHover) => createHover(),
    value: {
      read: ({ hovered }) => hovered(),
      expected: false,
    },
    ref: ({ ref }) => ref,
  }),
  createInViewport: valueCase({
    create: (createInViewport) => createInViewport(),
    value: {
      read: ({ inViewport }) => inViewport(),
      expected: false,
    },
    ref: ({ ref }) => ref,
  }),
  createInputState: valueCase({
    create: (createInputState) => createInputState("typed"),
    value: {
      read: ([value]) => value(),
      expected: "typed",
    },
    stateCommands: {
      run: ([, onChange]) => onChange("changed"),
      after: "changed",
    },
  }),
  createIntersection: valueCase({
    create: (createIntersection) => createIntersection(() => ({ threshold: [0, 1] })),
    value: {
      read: ({ entry }) => entry()?.isIntersecting ?? null,
      expected: null,
    },
    ref: ({ ref }) => ref,
  }),
  createListState: valueCase({
    create: (createListState) => createListState(() => [1, 2]),
    value: {
      read: ([list]) => list(),
      expected: [1, 2],
    },
    stateCommands: {
      run: ([, handlers]) => handlers.append(3),
      after: [1, 2, 3],
    },
  }),
  createMap: valueCase({
    create: (createMap) => createMap([["key", 1]]),
    value: {
      read: (map) => map(),
      expected: new Map([["key", 1]]),
    },
    stateCommands: {
      run: (map) => {
        map().set("other", 2);
      },
      after: new Map([
        ["key", 1],
        ["other", 2],
      ]),
    },
  }),
  createMediaQuery: valueCase({
    create: (createMediaQuery) => [
      createMediaQuery("(min-width: 1px)"),
      createMediaQuery(() => "(min-width: 1px)", true),
    ],
    value: {
      read: ([withoutInitial, withInitial]) => [withoutInitial(), withInitial()],
      expected: [false, true],
    },
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
  createPrevious: valueCase({
    create: (createPrevious) => createPrevious(() => "now"),
    value: {
      read: (previous) => previous(),
      expected: undefined,
    },
  }),
  createQueue: valueCase({
    create: (createQueue) => createQueue({ initialValues: [1, 2, 3], limit: 2 }),
    value: {
      read: ({ state, queue }) => [state(), queue()],
      expected: [[1, 2], [3]],
    },
    stateCommands: {
      run: ({ add }) => add(4),
      after: [
        [1, 2],
        [3, 4],
      ],
    },
  }),
  createResizeObserver: valueCase({
    create: (createResizeObserver) => createResizeObserver(),
    value: {
      read: ([, rect]) => rect(),
      expected: emptyRect,
    },
    ref: ([ref]) => ref,
  }),
  createScrollDirection: valueCase({
    create: (createScrollDirection) => createScrollDirection(),
    value: {
      read: (direction) => direction(),
      expected: "unknown",
    },
  }),
  createSet: valueCase({
    create: (createSet) => createSet(["member"]),
    value: {
      read: (set) => set(),
      expected: new Set(["member"]),
    },
    stateCommands: {
      run: (set) => {
        set().add("other");
      },
      after: new Set(["member", "other"]),
    },
  }),
  createSetState: valueCase({
    create: (createSetState) => createSetState({ page: 1 }),
    value: {
      read: ([state]) => state(),
      expected: { page: 1 },
    },
    stateCommands: {
      run: ([, setState]) => setState({ page: 2 }),
      after: { page: 2 },
    },
  }),
  createStateHistory: valueCase({
    create: (createStateHistory) => createStateHistory("first"),
    value: {
      read: ([value, , { history, current }]) => [value(), history(), current()],
      expected: ["first", ["first"], 0],
    },
    stateCommands: {
      run: ([, handlers]) => handlers.set("second"),
      after: ["second", ["first", "second"], 1],
    },
  }),
  createTextSelection: valueCase({
    create: (createTextSelection) => createTextSelection(),
    value: {
      read: (selection) => selection()?.type ?? null,
      expected: null,
    },
  }),
  createToggle: valueCase({
    create: (createToggle) => createToggle(["light", "dark"]),
    value: {
      read: ([value]) => value(),
      expected: "light",
    },
    stateCommands: {
      run: ([, toggle]) => toggle(),
      after: "dark",
    },
  }),
  createUncontrolled: valueCase({
    create: (createUncontrolled) =>
      createUncontrolled({ defaultValue: "default", finalValue: "final" }),
    value: {
      read: ([value, , controlled]) => [value(), controlled()],
      expected: ["default", false],
    },
    stateCommands: {
      run: ([, setValue]) => setValue("changed"),
      after: ["changed", false],
    },
  }),
  createValidatedState: valueCase({
    create: (createValidatedState) =>
      createValidatedState("ab", (text: string) => text.length > 2, true),
    value: {
      read: ([state]) => [state.value(), state.lastValidValue(), state.valid()],
      expected: ["ab", undefined, true],
    },
    stateCommands: {
      run: ([, setValue]) => setValue("abc"),
      after: ["abc", "abc", true],
    },
  }),
  createViewportSize: valueCase({
    create: (createViewportSize) => createViewportSize(),
    value: {
      read: ({ width, height }) => [width(), height()],
      expected: [0, 0],
    },
  }),
  createWindowEvent: serverCase({
    create: (createWindowEvent) =>
      createWindowEvent(
        "resize",
        () => undefined,
        () => ({ passive: true }),
      ),
  }),
  createWindowScroll: valueCase({
    create: (createWindowScroll) => createWindowScroll(),
    value: {
      read: ([position]) => position(),
      expected: { x: 0, y: 0 },
    },
    browserCommands: ([, scrollTo]) => scrollTo({}),
  }),
} satisfies { [K in Primitive]: ServerCase<Library[K]> } & {
  [K in BrowserValuePrimitive]: ValueCase<Library[K]>;
};

export const serverCases: { [K in Primitive]: ServerCase<Library[K]> } = cases;

export const valueCases: { [K in BrowserValuePrimitive]: ValueCase<Library[K]> } = cases;

function unheard(): () => void {
  return () => undefined;
}

export function startCase<K extends Primitive>(
  name: K,
  from: Pick<Library, K>,
  called: Called = unheard,
): Started {
  const found: ServerCase<Library[K]> = serverCases[name];
  return found.start(from[name], called);
}

export function startValueCase<K extends BrowserValuePrimitive>(
  name: K,
  from: Pick<Library, K>,
  called: Called = unheard,
): Started & Required<Pick<Started, "value">> {
  const found: ValueCase<Library[K]> = valueCases[name];
  return found.start(from[name], called);
}
