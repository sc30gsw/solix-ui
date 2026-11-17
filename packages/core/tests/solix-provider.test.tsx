import { join } from "node:path";
import { createComponent, renderToString } from "@solidjs/web";
import fc from "fast-check";
import postcss from "postcss";
import { expect, test } from "vite-plus/test";
import { tokenValues } from "../../../scripts/tokens";
import type * as CreateTheme from "../src/create-theme";
import type * as RunTimeStyle from "../src/run-time-style";
import type * as CascadeLayers from "../src/cascade-layers";
import { dist, library } from "./built-library";
import { elementsOf, valuesOf } from "./markup";

const { scaleOfThemeKey } = (await import(join(dist, "create-theme.js"))) as typeof CreateTheme;
const { runTimeStyleAttribute } = (await import(
  join(dist, "run-time-style.js")
)) as typeof RunTimeStyle;
const { behaviourSdkLayer, libraryCascadeLayer } = (await import(
  join(dist, "cascade-layers.js")
)) as typeof CascadeLayers;

const generatedRuns = 300;
const tokens = Object.keys(tokenValues());
const themeKeys = Object.keys(scaleOfThemeKey);
const sizes = [
  ...new Set(tokens.map((token) => token.split("-").at(-1) ?? "")),
  "xxl",
  "toString",
  "__proto__",
];
const characterThatLeavesItsPlace = /[;{}<]/;
const writable = fc.oneof(
  fc.stringMatching(/^[a-z0-9.%]{1,12}$/),
  fc.constantFrom("calc(1rem + 2px)", "var(--gap)", '"Inter", sans-serif', "a & b", "> x"),
);
const value = fc.oneof(
  writable,
  fc.constantFrom("1rem;color:red", "1rem}", "{", "</style><b>", "a<b"),
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
  fc.constantFrom("a{", "b}", ":root;", "<x>"),
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
            !characterThatLeavesItsPlace.test(declared) &&
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
  fc.assert(
    fc.property(theme, (given) => {
      expect(library.createTheme(given)).toBe(given);
    }),
  );
});

test("on the server, the provider writes one style for generated themes, selectors and nonces: a declaration for each value its theme sets on a token, none for a value that holds ; { } or <, for null, or for a key that names no token, all under the selector in the library's layer after the layer order, with the nonce getStyleNonce gives and the library's mark, and no style when nothing is written or withCssVariables is false", () => {
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
          !characterThatLeavesItsPlace.test(drawn.selector);
        const styles = elementsOf(html).filter(({ tag }) => tag === "style");

        expect(html).toContain(">Inside</button>");
        expect(styles).toHaveLength(written ? 1 : 0);
        if (!written) return;
        const [style] = styles;
        expect(valuesOf(style, "nonce")).toEqual(drawn.nonce === undefined ? [] : [drawn.nonce]);
        expect(valuesOf(style, runTimeStyleAttribute)).toHaveLength(1);
        const [order, layer, ...others] = postcss.parse(styleOf(html) ?? "").nodes;
        expect(others).toEqual([]);
        expect(order?.type === "atrule" && order.name === "layer" && order.params).toBe(
          `${behaviourSdkLayer}, ${libraryCascadeLayer}`,
        );
        expect(layer?.type === "atrule" && layer.name === "layer" && layer.params).toBe(
          libraryCascadeLayer,
        );
        const rules = layer?.type === "atrule" ? (layer.nodes ?? []) : [];
        expect(rules.map((rule) => (rule.type === "rule" ? rule.selector : rule.type))).toEqual([
          drawn.selector,
        ]);
        const [rule] = rules;
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
