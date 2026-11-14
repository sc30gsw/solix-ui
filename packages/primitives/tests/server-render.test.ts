import { expect, test } from "vite-plus/test";
import type * as Primitives from "../src/index";
import { library } from "./built-library";
import { type Primitive, type ServerCase, serialized, serverCases } from "./support/server-cases";
import {
  browserResourcesReadDuring,
  plainValuesIn,
  renderedOnTheServer,
} from "./support/server-harness";

type Library = typeof Primitives;

const primitivePrefix = "create";

function isPrimitive(name: string): name is Primitive {
  return Object.hasOwn(serverCases, name);
}

const primitives = Object.keys(serverCases).filter(isPrimitive).sort();

function renderOnTheServer<K extends Primitive>(name: K) {
  const { create, read, commands }: ServerCase<Library[K]> = serverCases[name];
  const primitive = library[name];
  const rendered = { returned: undefined as unknown, value: undefined as unknown, after: "" };
  const touched = browserResourcesReadDuring(() => {
    renderedOnTheServer(() => {
      rendered.returned = create(primitive);
      rendered.value = read?.(rendered.returned as never);
      commands?.(rendered.returned as never);
      rendered.after = serialized(read?.(rendered.returned as never));
      return rendered.after;
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
  "%s, built and called inside a server render, reads none of the browser resources, gives its server value, does nothing for a command called there, and returns nothing or only functions",
  (name) => {
    const { returned, value, after, touched } = renderOnTheServer(name);

    expect(touched, `${name} reads these browser resources on the server`).toEqual([]);
    expect(value, `${name}: its server value`).toEqual(serverCases[name].expected);
    expect(after, `${name}: its server value after its commands ran`).toBe(serialized(value));
    expect(
      plainValuesIn(returned, name),
      `${name}: return accessors and handlers only, so destructuring the result never freezes a value`,
    ).toEqual([]);
  },
);
