import { join } from "node:path";
import { runInNewContext } from "node:vm";
import { createComponent, renderToString } from "@solidjs/web";
import fc from "fast-check";
import { expect, test } from "vite-plus/test";
import type * as ColorSchemeScript from "#/src/color-scheme-script.tsx";
import { builtNamed, dist, library } from "#/tests/built-library.ts";
import { elementsOf, valuesOf } from "#/tests/markup.ts";
import { assertProperty } from "../../../tests/support/properties.ts";

const { colorSchemeScriptText } = (await import(
  join(dist, "color-scheme-script.jsx")
)) as typeof ColorSchemeScript;

const generatedRuns = 300;
const ownerSchemes = ["light", "dark", "auto"];
const anOwnerScheme: readonly unknown[] = ownerSchemes;
const ownerAttribute = "data-color-scheme";
const ownerStorageKey = "solix-color-scheme-value";
const darkQuery = "(prefers-color-scheme: dark)";

type Stored = { kind: "value"; value: string | null } | { kind: "throws" };

type Page = {
  stored: Stored;
  prefersDark: boolean;
  defaultColorScheme: string | undefined;
  forceColorScheme: "light" | "dark" | undefined;
  localStorageKey: string | undefined;
};

const page = fc.record({
  stored: fc.oneof(
    fc.record({
      kind: fc.constant("value" as const),
      value: fc.option(fc.oneof(fc.constantFrom(...ownerSchemes, "Dark", ""), fc.string()), {
        nil: null,
      }),
    }),
    fc.constant({ kind: "throws" as const }),
  ),
  prefersDark: fc.boolean(),
  defaultColorScheme: fc.option(fc.constantFrom(...ownerSchemes, "dim"), { nil: undefined }),
  forceColorScheme: fc.oneof(
    { weight: 3, arbitrary: fc.constant(undefined) },
    { weight: 1, arbitrary: fc.constantFrom("light" as const, "dark" as const) },
  ),
  localStorageKey: fc.option(
    fc.oneof(fc.constantFrom("theme", '"</script><b>', "a'b\\c "), fc.string()),
    { nil: undefined },
  ),
});

function expectedScheme(drawn: Page): string {
  if (drawn.forceColorScheme !== undefined) return drawn.forceColorScheme;
  const value = drawn.stored.kind === "throws" ? null : drawn.stored.value;
  const chosen =
    value !== null && ownerSchemes.includes(value)
      ? value
      : drawn.defaultColorScheme !== undefined && ownerSchemes.includes(drawn.defaultColorScheme)
        ? drawn.defaultColorScheme
        : "light";
  if (chosen !== "auto") return chosen;
  return drawn.prefersDark ? "dark" : "light";
}

type Run = { attributes: Map<string, string>; keysRead: string[]; globals: string[] };

function runScript(drawn: Page, before = ""): Run {
  const attributes = new Map<string, string>();
  const keysRead: string[] = [];
  const localStorage = {
    getItem: (key: string) => {
      keysRead.push(key);
      if (drawn.stored.kind === "throws") throw new Error("SecurityError");
      return drawn.stored.value;
    },
  };
  const page = {
    localStorage,
    matchMedia: (query: string) => ({ matches: query === darkQuery && drawn.prefersDark }),
    document: {
      documentElement: {
        setAttribute: (name: string, value: string) => attributes.set(name, value),
      },
    },
  };
  const given = Object.keys(page);
  runInNewContext(`${before}${colorSchemeScriptText(drawn)}`, page);
  return {
    attributes,
    keysRead,
    globals: Object.keys(page).filter((name) => !given.includes(name)),
  };
}

test("the pre-paint script sets data-color-scheme on <html> to the forced scheme, else to the stored scheme, else, and when the storage throws, to the default, with auto resolved by prefers-color-scheme, and reads the storage key it is given, for generated pages", async (context) => {
  await assertProperty(
    context,
    fc.property(page, (drawn) => {
      const { attributes, keysRead } = runScript(drawn);

      expect(Object.fromEntries(attributes)).toEqual({ [ownerAttribute]: expectedScheme(drawn) });
      expect(keysRead).toEqual(
        drawn.forceColorScheme === undefined ? [drawn.localStorageKey ?? ownerStorageKey] : [],
      );
    }),
    { numRuns: generatedRuns },
  );
});

test("the pre-paint script leaves no global behind, and runs on a page whose own script declared every one-letter name before it", async (context) => {
  const declared = `let ${"abcdefghijklmnopqrstuvwxyz".split("").join(",")};`;

  await assertProperty(
    context,
    fc.property(page, (drawn) => {
      const alone = runScript(drawn);
      const beside = runScript(drawn, declared);

      expect(alone.globals).toEqual([]);
      expect(Object.fromEntries(beside.attributes)).toEqual(Object.fromEntries(alone.attributes));
    }),
    { numRuns: generatedRuns },
  );
});

test("the pre-paint script never holds the text that would end its <script> element", async (context) => {
  await assertProperty(
    context,
    fc.property(page, (drawn) => {
      const text = colorSchemeScriptText(drawn);

      expect(text.toLowerCase()).not.toContain("</script");
      expect(text).not.toContain("<!--");
    }),
    { numRuns: generatedRuns },
  );
});

test("ColorSchemeScript renders one <script> with that text and nothing else in it, the nonce of the provider around it unless it is given one that is not undefined, empty or blank, and the attributes it is given", () => {
  const options = { defaultColorScheme: "auto" as const, localStorageKey: "theme" };
  const inside = renderToString(() =>
    createComponent(library.SolixProvider, {
      getStyleNonce: () => "page",
      get children() {
        return createComponent(library.ColorSchemeScript, options);
      },
    }),
  );
  const own = renderToString(() =>
    createComponent(library.ColorSchemeScript, { ...options, nonce: "own", id: "scheme" }),
  );
  const withUndefined = renderToString(() =>
    createComponent(library.SolixProvider, {
      getStyleNonce: () => "page",
      get children() {
        return createComponent(builtNamed("ColorSchemeScript"), {
          ...options,
          nonce: undefined,
          children: "alert(1)",
          textContent: "alert(2)",
        });
      },
    }),
  );
  const withBlank = ["", " "].map((blank) =>
    renderToString(() =>
      createComponent(library.SolixProvider, {
        getStyleNonce: () => "page",
        get children() {
          return createComponent(library.ColorSchemeScript, { ...options, nonce: blank });
        },
      }),
    ),
  );
  const [script] = elementsOf(inside).filter(({ tag }) => tag === "script");
  const [ownScript] = elementsOf(own).filter(({ tag }) => tag === "script");

  expect(elementsOf(inside).filter(({ tag }) => tag === "script")).toHaveLength(1);
  expect(withUndefined, "a nonce of undefined, children and textContent change nothing").toBe(
    inside,
  );
  expect(valuesOf(script, "nonce")).toEqual(["page"]);
  expect(withBlank, "an empty or blank nonce is no nonce").toEqual([inside, inside]);
  expect(valuesOf(ownScript, "nonce")).toEqual(["own"]);
  expect(valuesOf(ownScript, "id")).toEqual(["scheme"]);
  expect(valuesOf(script, "defaultcolorscheme")).toEqual([]);
  expect(inside).toContain(`>${colorSchemeScriptText(options)}</script>`);
});

test("the provider writes nothing of the colour scheme on the server: its markup is the same whatever scheme it is given", () => {
  const rendered = (props: Record<string, unknown>) =>
    renderToString(() =>
      createComponent(library.SolixProvider, {
        ...props,
        get children() {
          return createComponent(library.Button, { children: "Inside" });
        },
      }),
    );

  for (const props of [
    { defaultColorScheme: "dark" },
    { defaultColorScheme: "auto" },
    { forceColorScheme: "dark" },
  ]) {
    expect(rendered(props)).toBe(rendered({}));
  }
});

test("a provider inside another passes the outer provider's scheme on when it is given no getRootElement, and refuses a scheme prop without one, naming getRootElement", () => {
  const nested = (props: Record<string, unknown>) =>
    renderToString(() =>
      createComponent(library.SolixProvider, {
        get children() {
          return createComponent(library.SolixProvider, {
            ...props,
            get children() {
              return createComponent(library.Button, { children: "Inside" });
            },
          });
        },
      }),
    );

  expect(() => nested({})).not.toThrow();
  expect(() => nested({ forceColorScheme: "dark", getRootElement: () => undefined })).not.toThrow();
  for (const props of [
    { forceColorScheme: "dark" },
    { defaultColorScheme: "auto" },
    { colorSchemeManager: library.localStorageColorSchemeManager() },
  ]) {
    expect(() => nested(props)).toThrow("getRootElement");
  }
});

test("the library exports the name of the attribute that carries the scheme", () => {
  expect(library.colorSchemeAttribute).toBe(ownerAttribute);
});

test("isColorScheme is true for light, dark and auto, and false for any other value", async (context) => {
  for (const scheme of ownerSchemes) expect(library.isColorScheme(scheme)).toBe(true);
  await assertProperty(
    context,
    fc.property(
      fc.anything().filter((value) => !anOwnerScheme.includes(value)),
      (value) => {
        expect(library.isColorScheme(value)).toBe(false);
      },
    ),
    { numRuns: generatedRuns },
  );
});

test("on the server, the local-storage manager has nothing stored, tells its subscribers of a set and a clear until they leave, and touches no storage", () => {
  const manager = library.localStorageColorSchemeManager({ key: "theme" });
  const told: unknown[] = [];
  const others: unknown[] = [];
  const leave = manager.subscribe((scheme) => told.push(scheme));
  manager.subscribe((scheme) => others.push(scheme));

  expect(manager.get()).toBeUndefined();
  manager.set("dark");
  manager.clear();
  leave();
  manager.set("light");
  expect(told).toEqual(["dark", undefined]);
  expect(others).toEqual(["dark", undefined, "light"]);
  expect(Object.keys(manager).sort()).toEqual(["clear", "get", "set", "subscribe"]);
});

test("createColorScheme and createComputedColorScheme outside a SolixProvider throw, naming themselves", () => {
  for (const [name, create] of [
    ["createColorScheme", library.createColorScheme],
    ["createComputedColorScheme", library.createComputedColorScheme],
  ] as const) {
    expect(() =>
      renderToString(() => {
        create();
        return "";
      }),
    ).toThrow(name);
  }
});
