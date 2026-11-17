import { join } from "node:path";
import { createComponent, renderToString } from "@solidjs/web";
import fc from "fast-check";
import postcss from "postcss";
import { expect, test } from "vite-plus/test";
import { tokenValues } from "../../../scripts/tokens";
import type * as CreateTheme from "../src/create-theme";
import { layerOrder, libraryCascadeLayer, libraryStyleMark } from "../src/style-prop-table";
import { dist, library } from "./built-library";
import { elementsOf, valuesOf } from "./markup";

const { scaleOfThemeKey } = (await import(join(dist, "create-theme.js"))) as typeof CreateTheme;

const generatedRuns = 300;
const tokens = Object.keys(tokenValues());
const themeKeys = Object.keys(scaleOfThemeKey);
const sizes = [
  ...new Set(tokens.map((token) => token.split("-").at(-1) ?? "")),
  "xxl",
  "toString",
  "__proto__",
];
const refusedValues = [
  "1rem;color:red",
  "1rem}",
  "{",
  "</style><b>",
  "a<b",
  "1rem !important",
  "calc(1rem",
  "a)",
  "(]",
  "'open",
  "a /* b",
  "a\\b",
];
const refusedSelectors = ["a{", "b}", ":root;", "<x>", ":not(.a", "[data-x"];
const writable = fc.oneof(
  fc.stringMatching(/^[a-z0-9.%]{1,12}$/),
  fc.constantFrom(
    "calc(1rem + 2px)",
    "var(--gap)",
    '"Inter", sans-serif',
    "'a (b' 1rem",
    "a & b",
    "> x",
    "[a] 1rem",
  ),
);
const value = fc.oneof(
  writable,
  fc.constantFrom(...refusedValues),
  fc.constant(null),
  fc.constant(undefined),
);
const theme = fc.dictionary(
  fc.constantFrom(...themeKeys, "colors", "other"),
  fc.dictionary(fc.constantFrom(...sizes), value, { maxKeys: 4 }),
  { maxKeys: 5 },
);
const selector = fc.oneof(
  fc.constantFrom(":root", ".app", "[data-theme]", "#page > main"),
  fc.constantFrom(...refusedSelectors),
);
const nonce = fc.option(fc.stringMatching(/^[A-Za-z0-9+/]{1,24}={0,2}$/), { nil: undefined });

type Drawn = {
  theme: Record<string, Record<string, string | null | undefined>>;
  selector: string;
  nonce: string | undefined;
  withCssVariables: boolean | undefined;
};

function isThemeKey(key: string): key is keyof typeof scaleOfThemeKey {
  return Object.hasOwn(scaleOfThemeKey, key);
}

function expectedDeclarations({ theme: given }: Drawn): string[] {
  return Object.entries(given).flatMap(([key, written]) =>
    isThemeKey(key)
      ? Object.entries(written).flatMap(([size, declared]) => {
          const token = `--solix-${scaleOfThemeKey[key]}-${size}`;
          return typeof declared === "string" &&
            !refusedValues.includes(declared) &&
            tokens.includes(token)
            ? [`${token}:${declared}`]
            : [];
        })
      : [],
  );
}

function render(drawn: Drawn): string {
  return renderToString(() =>
    createComponent(library.SolixProvider, {
      theme: drawn.theme,
      cssVariablesSelector: drawn.selector,
      getStyleNonce: () => drawn.nonce,
      withCssVariables: drawn.withCssVariables,
      get children() {
        return createComponent(library.Button, { children: "Inside" });
      },
    }),
  );
}

function styleOf(html: string): string | undefined {
  return /<style[^>]*>([^<]*)<\/style>/.exec(html)?.[1];
}

test("createTheme gives back the theme it is given", () => {
  const given = { spacing: { md: "1rem" } };

  expect(library.createTheme(given)).toBe(given);
});

test("on the server, the provider writes its theme as one marked style with the nonce it is given, in the library's layer, for generated themes, selectors and nonces", () => {
  fc.assert(
    fc.property(
      fc.record({
        theme,
        selector,
        nonce,
        withCssVariables: fc.constantFrom(true, false, undefined),
      }),
      (drawn) => {
        const html = render(drawn);
        const declarations = expectedDeclarations(drawn);
        const written =
          drawn.withCssVariables !== false &&
          declarations.length > 0 &&
          !refusedSelectors.includes(drawn.selector);
        const styles = elementsOf(html).filter(({ tag }) => tag === "style");

        expect(html).toContain(">Inside</button>");
        expect(styles).toHaveLength(written ? 1 : 0);
        if (!written) return;
        const [style] = styles;
        expect(valuesOf(style, "nonce")).toEqual(drawn.nonce === undefined ? [] : [drawn.nonce]);
        expect(valuesOf(style, libraryStyleMark)).toHaveLength(1);
        const css = styleOf(html) ?? "";
        const [layer, ...others] = postcss.parse(css.slice(layerOrder.length)).nodes;
        const rules = layer?.type === "atrule" ? (layer.nodes ?? []) : [];
        const [rule] = rules;

        expect(others).toEqual([]);
        expect(css.startsWith(layerOrder)).toBe(true);
        expect(layer?.type === "atrule" ? [layer.name, layer.params] : layer?.type).toEqual([
          "layer",
          libraryCascadeLayer,
        ]);
        expect(rules.map((found) => (found.type === "rule" ? found.selector : found.type))).toEqual(
          [drawn.selector],
        );
        expect(
          rule?.type === "rule"
            ? rule.nodes.map((node) => (node.type === "decl" ? `${node.prop}:${node.value}` : ""))
            : [],
        ).toEqual(declarations);
      },
    ),
    { numRuns: generatedRuns },
  );
});

test("a provider given no getStyleNonce gives its theme style the nonce of the provider around it", () => {
  const html = renderToString(() =>
    createComponent(library.SolixProvider, {
      getStyleNonce: () => "outer",
      get children() {
        return createComponent(library.SolixProvider, {
          theme: { spacing: { md: "1rem" } },
          cssVariablesSelector: ".inner",
        });
      },
    }),
  );

  expect(
    elementsOf(html)
      .filter(({ tag }) => tag === "style")
      .map((style) => valuesOf(style, "nonce")),
  ).toEqual([["outer"]]);
});
