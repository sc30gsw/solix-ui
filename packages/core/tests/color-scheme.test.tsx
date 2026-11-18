import { join } from "node:path";
import { runInNewContext } from "node:vm";
import { createComponent, renderToString } from "@solidjs/web";
import fc from "fast-check";
import { expect, test } from "vite-plus/test";
import type * as ColorScheme from "#/src/color-scheme.ts";
import { dist, library } from "#/tests/built-library.ts";
import { elementsOf, valuesOf } from "#/tests/markup.ts";

const { colorSchemeScriptText } = (await import(
  join(dist, "color-scheme.js")
)) as typeof ColorScheme;

const generatedRuns = 300;
const ownerSchemes = ["light", "dark", "auto"];
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

function expectedScheme(drawn: Page): string | undefined {
  if (drawn.forceColorScheme !== undefined) return drawn.forceColorScheme;
  if (drawn.stored.kind === "throws") return undefined;
  const { value } = drawn.stored;
  const chosen =
    value !== null && ownerSchemes.includes(value)
      ? value
      : drawn.defaultColorScheme !== undefined && ownerSchemes.includes(drawn.defaultColorScheme)
        ? drawn.defaultColorScheme
        : "light";
  if (chosen !== "auto") return chosen;
  return drawn.prefersDark ? "dark" : "light";
}

function runScript(drawn: Page): { attributes: Map<string, string>; keysRead: string[] } {
  const attributes = new Map<string, string>();
  const keysRead: string[] = [];
  const localStorage = {
    getItem: (key: string) => {
      keysRead.push(key);
      if (drawn.stored.kind === "throws") throw new Error("SecurityError");
      return drawn.stored.value;
    },
  };
  runInNewContext(
    colorSchemeScriptText({
      defaultColorScheme: drawn.defaultColorScheme as ColorScheme.SolixColorScheme | undefined,
      forceColorScheme: drawn.forceColorScheme,
      localStorageKey: drawn.localStorageKey,
    }),
    {
      localStorage,
      matchMedia: (query: string) => ({ matches: query === darkQuery && drawn.prefersDark }),
      document: {
        documentElement: {
          setAttribute: (name: string, value: string) => attributes.set(name, value),
        },
      },
    },
  );
  return { attributes, keysRead };
}

test("the pre-paint script sets data-color-scheme on <html> to the forced scheme, else to the stored scheme, else to the default, with auto resolved by prefers-color-scheme, reads the storage key it is given, and sets nothing when the storage throws, for generated pages", () => {
  fc.assert(
    fc.property(page, (drawn) => {
      const { attributes, keysRead } = runScript(drawn);
      const expected = expectedScheme(drawn);

      expect(Object.fromEntries(attributes)).toEqual(
        expected === undefined ? {} : { [ownerAttribute]: expected },
      );
      expect(keysRead).toEqual(
        drawn.forceColorScheme === undefined ? [drawn.localStorageKey ?? ownerStorageKey] : [],
      );
    }),
    { numRuns: generatedRuns },
  );
});

test("the pre-paint script never holds the text that would end its <script> element", () => {
  fc.assert(
    fc.property(page, (drawn) => {
      const text = colorSchemeScriptText({
        defaultColorScheme: drawn.defaultColorScheme as ColorScheme.SolixColorScheme | undefined,
        forceColorScheme: drawn.forceColorScheme,
        localStorageKey: drawn.localStorageKey,
      });

      expect(text.toLowerCase()).not.toContain("</script");
      expect(text).not.toContain("<!--");
    }),
    { numRuns: generatedRuns },
  );
});

test("ColorSchemeScript renders one <script> with that text, the nonce of the provider around it unless it is given its own, and the attributes it is given", () => {
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
  const [script] = elementsOf(inside).filter(({ tag }) => tag === "script");
  const [ownScript] = elementsOf(own).filter(({ tag }) => tag === "script");

  expect(elementsOf(inside).filter(({ tag }) => tag === "script")).toHaveLength(1);
  expect(valuesOf(script, "nonce")).toEqual(["page"]);
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

test("isColorScheme is true for light, dark and auto, and false for any other value", () => {
  for (const scheme of ownerSchemes) expect(library.isColorScheme(scheme)).toBe(true);
  fc.assert(
    fc.property(
      fc.anything().filter((value) => !ownerSchemes.includes(value as string)),
      (value) => {
        expect(library.isColorScheme(value)).toBe(false);
      },
    ),
    { numRuns: generatedRuns },
  );
});

test("on the server, the local-storage manager gives back the default and its other calls do nothing", () => {
  const manager = library.localStorageColorSchemeManager({ key: "theme" });

  for (const scheme of ["light", "dark", "auto"] as const) expect(manager.get(scheme)).toBe(scheme);
  expect(() => {
    manager.set("dark");
    manager.subscribe(() => {});
    manager.unsubscribe();
    manager.clear();
  }).not.toThrow();
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
