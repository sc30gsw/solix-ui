import { expect, test } from "vite-plus/test";
import type * as Primitives from "../src/index";
import { library } from "./built-library";
import {
  browserResourcesReadDuring,
  plainValuesIn,
  renderedOnTheServer,
  serialized,
} from "./support/server-harness";

type Library = typeof Primitives;
type Primitive = Extract<keyof Library, `create${string}`>;
type ServerCase<F> = {
  create: (primitive: F) => unknown;
  read: (returned: never) => unknown;
  expected: unknown;
};

const primitivePrefix = "create";

function serverCase<F, R>(cases: {
  create: (primitive: F) => R;
  read: (returned: R) => unknown;
  expected: unknown;
}): ServerCase<F> {
  return cases;
}

const serverCases: { [K in Primitive]: ServerCase<Library[K]> } = {
  createClickOutside: serverCase({
    create: (createClickOutside) => {
      const withNodes = createClickOutside(
        () => undefined,
        ["mousedown"],
        () => [undefined],
      );
      return [createClickOutside(() => undefined), () => withNodes] as const;
    },
    read: ([ref, withNodes]) => [typeof ref, withNodes()],
    expected: ["function", undefined],
  }),
  createCounter: serverCase({
    create: (createCounter) => createCounter(11, { min: 0, max: 10 }),
    read: ([count]) => count(),
    expected: 10,
  }),
  createDisclosure: serverCase({
    create: (createDisclosure) => createDisclosure(true),
    read: ([opened]) => opened(),
    expected: true,
  }),
  createEventListener: serverCase({
    create: (createEventListener) =>
      createEventListener(
        "click",
        () => undefined,
        () => ({ capture: true }),
      ),
    read: (ref) => typeof ref,
    expected: "function",
  }),
  createInputState: serverCase({
    create: (createInputState) => createInputState("typed"),
    read: ([value]) => value(),
    expected: "typed",
  }),
  createListState: serverCase({
    create: (createListState) => createListState(() => [1, 2]),
    read: ([list]) => list(),
    expected: [1, 2],
  }),
  createMap: serverCase({
    create: (createMap) => createMap([["key", 1]]),
    read: (map) => map(),
    expected: new Map([["key", 1]]),
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
  }),
  createSet: serverCase({
    create: (createSet) => createSet(["member"]),
    read: (set) => set(),
    expected: new Set(["member"]),
  }),
  createSetState: serverCase({
    create: (createSetState) => createSetState({ page: 1 }),
    read: ([state]) => state(),
    expected: { page: 1 },
  }),
  createStateHistory: serverCase({
    create: (createStateHistory) => createStateHistory("first"),
    read: ([value, , { history, current }]) => [value(), history(), current()],
    expected: ["first", ["first"], 0],
  }),
  createToggle: serverCase({
    create: (createToggle) => createToggle(["light", "dark"]),
    read: ([value]) => value(),
    expected: "light",
  }),
  createUncontrolled: serverCase({
    create: (createUncontrolled) =>
      createUncontrolled({ defaultValue: "default", finalValue: "final" }),
    read: ([value, , controlled]) => [value(), controlled()],
    expected: ["default", false],
  }),
  createValidatedState: serverCase({
    create: (createValidatedState) =>
      createValidatedState("ab", (text: string) => text.length > 2, true),
    read: ([state]) => [state.value(), state.lastValidValue(), state.valid()],
    expected: ["ab", undefined, true],
  }),
  createWindowEvent: serverCase({
    create: (createWindowEvent) =>
      createWindowEvent(
        "resize",
        () => undefined,
        () => ({ passive: true }),
      ),
    read: (returned) => returned,
    expected: undefined,
  }),
};

function isPrimitive(name: string): name is Primitive {
  return Object.hasOwn(serverCases, name);
}

const primitives = Object.keys(serverCases).filter(isPrimitive).sort();

function renderOnTheServer<K extends Primitive>(name: K) {
  const { create, read }: ServerCase<Library[K]> = serverCases[name];
  const primitive = library[name];
  const rendered: { returned: unknown; value: unknown } = { returned: undefined, value: undefined };
  const touched = browserResourcesReadDuring(() => {
    renderedOnTheServer(() => {
      rendered.returned = create(primitive);
      rendered.value = read(rendered.returned as never);
      return serialized(rendered.value);
    });
  });
  return { ...rendered, touched };
}

test("the build exports exactly the primitives the server cases cover", () => {
  const built = Object.entries(library)
    .filter(([name, value]) => name.startsWith(primitivePrefix) && typeof value === "function")
    .map(([name]) => name)
    .sort();

  expect(primitives.length).toBeGreaterThan(0);
  expect(built).toEqual(primitives);
});

test("a primitive that returns nothing, or only functions, passes; one that returns a value fails", () => {
  const command = () => undefined;

  expect(plainValuesIn(undefined, "createNothing")).toEqual([]);
  expect(plainValuesIn([command, { open: command }], "createTuple")).toEqual([]);
  expect(plainValuesIn([command, 1], "createFrozen")).toEqual(["createFrozen[1] is 1"]);
});

test.each(primitives)(
  "%s, built and called inside a server render, reads none of the browser resources, gives its server value, and returns nothing or only functions",
  (name) => {
    const { returned, value, touched } = renderOnTheServer(name);

    expect(touched, `${name} reads these browser resources on the server`).toEqual([]);
    expect(value, `${name}: its server value`).toEqual(serverCases[name].expected);
    expect(
      plainValuesIn(returned, name),
      `${name}: return accessors and handlers only, so destructuring the result never freezes a value`,
    ).toEqual([]);
  },
);
