import { expect, test } from "vite-plus/test";
import { type Primitive, serialized, serverCases, startCase } from "#/fixtures/server-cases.ts";
import { library } from "#/tests/built-library.ts";
import {
  browserResourcesReadDuring,
  plainValuesIn,
  renderedOnTheServer,
} from "#/tests/support/server-harness.ts";

const primitivePrefix = "create";

function isPrimitive(name: string): name is Primitive {
  return Object.hasOwn(serverCases, name);
}

const primitives = Object.keys(serverCases).filter(isPrimitive).sort();

function renderOnTheServer(name: Primitive) {
  const rendered = {
    returned: undefined as unknown,
    value: undefined as unknown,
    expected: undefined as unknown,
    afterBrowserCommands: "",
  };
  const touched = browserResourcesReadDuring(() => {
    renderedOnTheServer(() => {
      const started = startCase(name, library);
      rendered.returned = started.returned;
      rendered.value = started.value?.read();
      rendered.expected = started.value?.expected;
      started.browserCommands?.();
      rendered.afterBrowserCommands = serialized(started.value?.read());
      return rendered.afterBrowserCommands;
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
  "%s, built and called inside a server render, reads none of the browser resources, gives its server value, keeps it when a browser command is called there and returns nothing or only functions",
  (name) => {
    const { returned, value, expected, afterBrowserCommands, touched } = renderOnTheServer(name);

    expect(touched, `${name} reads these browser resources on the server`).toEqual([]);
    expect(value, `${name}: its server value`).toEqual(expected);
    expect(afterBrowserCommands, `${name}: its server value after its browser commands ran`).toBe(
      serialized(value),
    );
    expect(
      plainValuesIn(returned, name),
      `${name}: return accessors and handlers only, so destructuring the result never freezes a value`,
    ).toEqual([]);
  },
);
