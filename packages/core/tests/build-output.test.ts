import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import postcss from "postcss";
import { expect, test } from "vite-plus/test";
import {
  LIBRARY_CASCADE_LAYER,
  LIBRARY_CLASS_PREFIX,
  STYLE_PROP_LAYER,
} from "../build-pipeline.mjs";
import { stylePropNames } from "../src/style-props";
import { builtComponents } from "./built-components";
import { nestedLayerOrder } from "./cascade-layers";

const dist = join(import.meta.dirname, "../dist");
const stylesheet = readFileSync(join(dist, "styles.css"), "utf8").trim();
const ownerBreakpoints: [name: string, width: string][] = [
  ["xs", "36em"],
  ["sm", "48em"],
  ["md", "62em"],
  ["lg", "75em"],
  ["xl", "88em"],
];
const stylePropClass = `.${LIBRARY_CLASS_PREFIX}-`;

type PlacedRule = {
  selector: string;
  media: string | undefined;
  declarations: string[];
  inStylePropLayer: boolean;
};

function libraryLayer(): postcss.AtRule {
  const layer = postcss
    .parse(stylesheet)
    .nodes.find(
      (node): node is postcss.AtRule =>
        node.type === "atrule" && node.name === "layer" && node.params === LIBRARY_CASCADE_LAYER,
    );
  if (!layer) {
    throw new Error(
      `packages/core/dist/styles.css: wrap the rules in @layer ${LIBRARY_CASCADE_LAYER}.`,
    );
  }
  return layer;
}

function enclosingAtRules(node: postcss.Node): postcss.AtRule[] {
  const parent = node.parent;
  if (!(parent instanceof postcss.AtRule)) return [];
  return [parent, ...enclosingAtRules(parent)];
}

function placedRules(): PlacedRule[] {
  const placed: PlacedRule[] = [];
  libraryLayer().walkRules((rule) => {
    const enclosing = enclosingAtRules(rule);
    placed.push({
      selector: rule.selector,
      media: enclosing.find(({ name }) => name === "media")?.params,
      declarations: rule.nodes.flatMap((node) =>
        node.type === "decl" ? [`${node.prop}:${node.value}`] : [],
      ),
      inStylePropLayer: enclosing.some(
        ({ name, params }) => name === "layer" && params === STYLE_PROP_LAYER,
      ),
    });
  });
  return placed;
}

function stylePropLayerRules(): { inside: PlacedRule[]; outside: PlacedRule[] } {
  const placed = placedRules();
  return {
    inside: placed.filter(({ inStylePropLayer }) => inStylePropLayer),
    outside: placed.filter(({ inStylePropLayer }) => !inStylePropLayer),
  };
}

function depthAfterEachCharacter(css: string): number[] {
  let depth = 0;
  return css.split("").map((character) => {
    if (character === "{") depth += 1;
    if (character === "}") depth -= 1;
    return depth;
  });
}

test("every rule sits inside the one library cascade layer", () => {
  expect(stylesheet.startsWith(`@layer ${LIBRARY_CASCADE_LAYER} {`)).toBe(true);

  const depths = depthAfterEachCharacter(stylesheet);
  const firstBrace = stylesheet.indexOf("{");
  const positionsBackAtTopLevel = depths
    .map((depth, position) => (position >= firstBrace && depth === 0 ? position : -1))
    .filter((position) => position !== -1);

  expect(positionsBackAtTopLevel).toEqual([stylesheet.length - 1]);
});

test("every class name carries the library's own prefix", () => {
  const classNames = stylesheet.match(/\.[A-Za-z_][\w-]*/g) ?? [];

  const stylexDefaultPrefix = "x";

  expect(LIBRARY_CLASS_PREFIX).not.toBe(stylexDefaultPrefix);
  expect(classNames.length).toBeGreaterThan(0);
  expect(classNames.filter((name) => !name.startsWith(`.${LIBRARY_CLASS_PREFIX}`))).toEqual([]);
});

test("no declaration is marked important, so nothing in the layer can outrank a consumer", () => {
  const important: string[] = [];
  postcss.parse(stylesheet).walkDecls((declaration) => {
    if (declaration.important) important.push(`${declaration.prop}: ${declaration.value}`);
  });

  expect(important).toEqual([]);
});

test("a token keeps its public custom property name", () => {
  expect(stylesheet).toContain("--solix-color-primary:");
  expect(readFileSync(join(dist, "tokens.stylex.js"), "utf8")).toContain(
    "var(--solix-color-primary)",
  );
});

test("open state compiles to a selector on the element's own open attribute", () => {
  expect(stylesheet).toMatch(new RegExp(`\\.${LIBRARY_CLASS_PREFIX}\\w+\\[open\\]\\{`));
  expect(stylesheet).not.toMatch(/\[open\] \*/);
});

test.each(builtComponents)(
  "%s ships as JSX source with its styles compiled to class names",
  (name) => {
    const file = join(dist, `${name}.jsx`);
    const where = `packages/core/dist/${name}.jsx`;

    expect(existsSync(file), `${where}: build the library so the component ships`).toBe(true);
    const source = readFileSync(file, "utf8");
    expect(source, `${where}: compile stylex.create away in the build`).not.toContain(
      "stylex.create",
    );
    expect(source, `${where}: compile stylex.attrs away in the build`).not.toContain(
      "stylex.attrs",
    );
    expect(source, `${where}: keep the stable class on the root`).toContain(`solix-${name}-root`);
  },
);

test("input validity and the modal backdrop compile to the platform's own selectors", () => {
  expect(stylesheet).toMatch(new RegExp(`\\.${LIBRARY_CLASS_PREFIX}\\w+:user-invalid\\{`));
  expect(stylesheet).toMatch(new RegExp(`\\.${LIBRARY_CLASS_PREFIX}\\w+::backdrop\\{`));
});

test("the style-prop layer sits inside the library layer, ordered after every layer StyleX emits", () => {
  const order = nestedLayerOrder(libraryLayer());

  expect(order.length, "StyleX emits layers of its own inside the library layer").toBeGreaterThan(
    1,
  );
  expect(order.filter((name) => name === STYLE_PROP_LAYER)).toEqual([STYLE_PROP_LAYER]);
  expect(order.at(-1), `the nested layer order is ${order.join(", ")}`).toBe(STYLE_PROP_LAYER);
});

test("the style-prop layer holds the style-prop classes and only them, each with the library prefix", () => {
  const { inside, outside } = stylePropLayerRules();

  expect(inside.length).toBeGreaterThan(0);
  expect(
    inside.filter(
      ({ selector }) => !/^\.[\w-]+$/.test(selector) || !selector.startsWith(stylePropClass),
    ),
  ).toEqual([]);
  expect(outside.filter(({ selector }) => selector.includes(stylePropClass))).toEqual([]);
});

test("each style prop reads its own custom property, at its base and then at each breakpoint in ascending order", () => {
  const { inside } = stylePropLayerRules();
  const violations = stylePropNames.flatMap((name) => {
    const expected = [
      { suffix: name, media: undefined },
      ...ownerBreakpoints.map(([breakpoint, width]) => ({
        suffix: `${name}-${breakpoint}`,
        media: `(min-width: ${width})`,
      })),
    ];
    const found = inside.filter(({ selector }) =>
      expected.some(({ suffix }) => selector === `${stylePropClass}${suffix}`),
    );
    const wanted = expected.map(
      ({ suffix, media }) => `${stylePropClass}${suffix} in ${media ?? "no media query"}`,
    );
    const written = found.map(
      ({ selector, media }) => `${selector} in ${media ?? "no media query"}`,
    );
    const reads = found.filter(
      ({ selector, declarations }) =>
        declarations.length !== 1 || !declarations[0].endsWith(`:var(--${selector.slice(1)})`),
    );
    return [
      ...(JSON.stringify(written) === JSON.stringify(wanted)
        ? []
        : [
            `packages/core/src/style-props.ts: emit ${wanted.join(", ")} in that order for ${name}, not ${written.join(", ")}.`,
          ]),
      ...reads.map(
        ({ selector, declarations }) =>
          `packages/core/src/style-props.ts: ${selector} declares ${declarations.join("; ")}; make it set one property to var(--${selector.slice(1)}).`,
      ),
    ];
  });

  expect(violations).toEqual([]);
});

test("hiddenFrom and visibleFrom hide the element from, or below, each breakpoint, after every style-prop rule", () => {
  const { inside } = stylePropLayerRules();
  const stylePropSelectors = stylePropNames.flatMap((name) => [
    `${stylePropClass}${name}`,
    ...ownerBreakpoints.map(([breakpoint]) => `${stylePropClass}${name}-${breakpoint}`),
  ]);
  const lastStyleProp = inside.findLastIndex(({ selector }) =>
    stylePropSelectors.includes(selector),
  );
  const expected = ownerBreakpoints.flatMap(([breakpoint, width]) => [
    { selector: `${stylePropClass}hidden-from-${breakpoint}`, media: `(min-width: ${width})` },
    { selector: `${stylePropClass}visible-from-${breakpoint}`, media: `(width < ${width})` },
  ]);
  const violations = expected.flatMap(({ selector, media }) => {
    const index = inside.findIndex((rule) => rule.selector === selector);
    const rule = inside[index];
    if (!rule) return [`packages/core/src/style-props.ts: emit ${selector}.`];
    return [
      ...(rule.media === media
        ? []
        : [`${selector}: put it in @media ${media}, not ${rule.media}.`]),
      ...(JSON.stringify(rule.declarations) === JSON.stringify(["display:none"])
        ? []
        : [
            `${selector}: declare display:none and nothing else, not ${rule.declarations.join("; ")}.`,
          ]),
      ...(index > lastStyleProp
        ? []
        : [
            `${selector}: emit it after every style-prop rule, so the display prop cannot undo it.`,
          ]),
    ];
  });

  expect(violations).toEqual([]);
});
