import { join } from "node:path";
import { createComponent, renderToString } from "@solidjs/web";
import { expect, test } from "vite-plus/test";
import type * as Primitives from "../src/index";

type Library = typeof Primitives;
type Primitive = {
  [K in keyof Library]: Library[K] extends (...args: never[]) => unknown ? K : never;
}[keyof Library];
type Run = { returned: unknown; value: unknown };
type ServerCase<F> = { run: (primitive: F) => Run; expected: unknown };

const dist = join(import.meta.dirname, "../dist");
const built = (await import(join(dist, "index.js"))) as Record<string, unknown>;
const builtPrimitives = Object.keys(built)
  .filter((name) => typeof built[name] === "function")
  .sort();

const browserOnlyGlobals = [
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
  "requestAnimationFrame",
  "requestIdleCallback",
  "setTimeout",
  "setInterval",
  "ResizeObserver",
  "IntersectionObserver",
  "MutationObserver",
  "HTMLElement",
];

const serverCases: { [K in Primitive]: ServerCase<Library[K]> } = {
  createCounter: {
    run: (createCounter) => {
      const returned = createCounter(11, { min: 0, max: 10 });
      return { returned, value: returned[0]() };
    },
    expected: 10,
  },
  createDisclosure: {
    run: (createDisclosure) => {
      const returned = createDisclosure(true);
      return { returned, value: returned[0]() };
    },
    expected: true,
  },
  createInputState: {
    run: (createInputState) => {
      const returned = createInputState("typed");
      return { returned, value: returned[0]() };
    },
    expected: "typed",
  },
  createListState: {
    run: (createListState) => {
      const returned = createListState(() => [1, 2]);
      return { returned, value: returned[0]() };
    },
    expected: [1, 2],
  },
  createMap: {
    run: (createMap) => {
      const returned = createMap([["key", 1]]);
      return { returned, value: returned() };
    },
    expected: new Map([["key", 1]]),
  },
  createPrevious: {
    run: (createPrevious) => {
      const returned = createPrevious(() => "now");
      return { returned, value: returned() };
    },
    expected: undefined,
  },
  createQueue: {
    run: (createQueue) => {
      const returned = createQueue({ initialValues: [1, 2, 3], limit: 2 });
      return { returned, value: [returned.state(), returned.queue()] };
    },
    expected: [[1, 2], [3]],
  },
  createSet: {
    run: (createSet) => {
      const returned = createSet(["member"]);
      return { returned, value: returned() };
    },
    expected: new Set(["member"]),
  },
  createSetState: {
    run: (createSetState) => {
      const returned = createSetState({ page: 1 });
      return { returned, value: returned[0]() };
    },
    expected: { page: 1 },
  },
  createStateHistory: {
    run: (createStateHistory) => {
      const returned = createStateHistory("first");
      return { returned, value: [returned[0](), returned[2].history(), returned[2].current()] };
    },
    expected: ["first", ["first"], 0],
  },
  createToggle: {
    run: (createToggle) => {
      const returned = createToggle(["light", "dark"]);
      return { returned, value: returned[0]() };
    },
    expected: "light",
  },
  createUncontrolled: {
    run: (createUncontrolled) => {
      const returned = createUncontrolled({ defaultValue: "default", finalValue: "final" });
      return { returned, value: [returned[0](), returned[2]()] };
    },
    expected: ["default", false],
  },
  createValidatedState: {
    run: (createValidatedState) => {
      const returned = createValidatedState("ab", (text: string) => text.length > 2, true);
      const [state] = returned;
      return { returned, value: [state.value(), state.lastValidValue(), state.valid()] };
    },
    expected: ["ab", undefined, true],
  },
};

function serialized(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) => {
    if (item instanceof Map || item instanceof Set) return [...item];
    return item === undefined ? "undefined" : item;
  });
}

function notFunctions(returned: unknown, path: string): string[] {
  if (typeof returned === "function") return [];
  if (Array.isArray(returned)) {
    return returned.flatMap((member, index) => notFunctions(member, `${path}[${index}]`));
  }
  if (typeof returned === "object" && returned !== null) {
    return Object.entries(returned).flatMap(([key, member]) =>
      notFunctions(member, `${path}.${key}`),
    );
  }
  return [`${path} is ${serialized(returned)}`];
}

function withBrowserGlobalsTrapped<T>(render: () => T): { rendered: T; touched: string[] } {
  const touched: string[] = [];
  const saved = browserOnlyGlobals.map((name) => ({
    name,
    descriptor: Object.getOwnPropertyDescriptor(globalThis, name),
  }));
  for (const name of browserOnlyGlobals) {
    Object.defineProperty(globalThis, name, {
      configurable: true,
      get() {
        touched.push(name);
        throw new ReferenceError(`${name} is not available on the server`);
      },
    });
  }
  try {
    return { rendered: render(), touched };
  } finally {
    for (const { name, descriptor } of saved) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else Reflect.deleteProperty(globalThis, name);
    }
  }
}

function renderOnTheServer(name: string): { html: string; run: Run; touched: string[] } {
  const serverCase = (serverCases as Record<string, ServerCase<unknown> | undefined>)[name];
  if (!serverCase) {
    throw new Error(
      `packages/primitives/tests/server-render.test.ts: add a server case for ${name}.`,
    );
  }
  let run: Run = { returned: undefined, value: undefined };
  const { rendered, touched } = withBrowserGlobalsTrapped(() =>
    renderToString(() =>
      createComponent(() => {
        run = serverCase.run(built[name]);
        return serialized(run.value);
      }, {}),
    ),
  );
  return { html: rendered, run, touched };
}

test("the built library exports primitives", () => {
  expect(builtPrimitives.length).toBeGreaterThan(0);
});

test.each(builtPrimitives)(
  "%s renders on the server without a browser global, gives its server value, and returns only functions",
  (name) => {
    const first = renderOnTheServer(name);
    const second = renderOnTheServer(name);
    const serverCase = (serverCases as Record<string, ServerCase<unknown>>)[name];

    expect(first.touched, `${name} reads these browser globals on the server`).toEqual([]);
    expect(first.run.value, `${name}: its server value`).toEqual(serverCase.expected);
    expect(
      notFunctions(first.run.returned, name),
      `${name}: return accessors and handlers only, so destructuring the result never freezes a value`,
    ).toEqual([]);
    expect(second.html, `${name} renders the same markup every time`).toBe(first.html);
  },
);
