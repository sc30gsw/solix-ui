import { readFileSync } from "node:fs";
import { join } from "node:path";
import postcss from "postcss";
import { expect, test } from "vite-plus/test";
import {
  LIBRARY_CASCADE_LAYER,
  LIBRARY_CLASS_PREFIX,
  STYLE_PROP_LAYER,
} from "../build-pipeline.mjs";
import {
  breakpoints,
  canonicalStylePropNames,
  childRuleLayer,
  responsiveKeys,
  stylePropClassPrefix,
  stylePropNames,
  variableClass,
  variableGroups,
  variableNames,
  variableRow,
  variablesOf,
  visibilityClass,
  visibilityPropNames,
} from "../src/style-prop-table";
import { builtComponents, builtSource, dist, stylesheet as builtStylesheet } from "./built-library";
import { parse, ts } from "../../../scripts/syntax";
import {
  enclosingAtRules,
  inChildRuleLayer,
  inStylePropLayer,
  nestedLayerOrder,
} from "./cascade-layers";

const stylesheet = builtStylesheet.trim();
const ownerBreakpoints: [name: string, width: string][] = [
  ["xs", "36em"],
  ["sm", "48em"],
  ["md", "62em"],
  ["lg", "75em"],
  ["xl", "88em"],
];
const stylePropClass = `.${LIBRARY_CLASS_PREFIX}-`;
const stylePropCustomProperty = `--${LIBRARY_CLASS_PREFIX}-`;
const builtStylePropTable = "style-prop-table.js";
const boxSides = ["top", "right", "bottom", "left"];
const sidesOfLogicalPart: Record<string, string[]> = {
  inline: ["left", "right"],
  block: ["top", "bottom"],
  "inline-start": ["left"],
  "inline-end": ["right"],
  "block-start": ["top"],
  "block-end": ["bottom"],
};
const backgroundLonghands = [
  "color",
  "image",
  "position",
  "size",
  "repeat",
  "attachment",
  "origin",
  "clip",
];

type PlacedRule = {
  selector: string;
  media: string | undefined;
  declarations: string[];
  inStylePropLayer: boolean;
  inChildRuleLayer: boolean;
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
      inStylePropLayer: inStylePropLayer(rule),
      inChildRuleLayer: inChildRuleLayer(rule),
    });
  });
  return placed;
}

function registrations(): postcss.AtRule[] {
  const found: postcss.AtRule[] = [];
  libraryLayer().walkAtRules("property", (rule) => {
    found.push(rule);
  });
  return found;
}

function descriptor(rule: postcss.AtRule, name: string): string | undefined {
  return rule.nodes
    ?.find((node): node is postcss.Declaration => node.type === "decl" && node.prop === name)
    ?.value.trim();
}

function longhandsSetBy(property: string): string[] {
  const box = /^(margin|padding)(?:-([a-z-]+))?$/.exec(property);
  if (box) {
    const [, family, part] = box;
    const sides = part === undefined ? boxSides : (sidesOfLogicalPart[part] ?? [part]);
    return sides.map((side) => `${family}-${side}`);
  }
  if (property === "inset") return boxSides;
  if (property === "gap") return ["row-gap", "column-gap"];
  if (property === "background") return backgroundLonghands.map((part) => `background-${part}`);
  return [property];
}

function setsEverythingAndMore(shorthand: string, longhand: string): boolean {
  const covered = longhandsSetBy(shorthand);
  const inner = longhandsSetBy(longhand);
  return covered.length > inner.length && inner.every((side) => covered.includes(side));
}

function stylePropLayerRules(): {
  inside: PlacedRule[];
  outside: PlacedRule[];
  childRules: PlacedRule[];
} {
  const placed = placedRules();
  return {
    inside: placed.filter((rule) => rule.inStylePropLayer && !rule.inChildRuleLayer),
    outside: placed.filter((rule) => !rule.inStylePropLayer),
    childRules: placed.filter((rule) => rule.inChildRuleLayer),
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
    expect(
      builtSource(name),
      `packages/core/dist/${name}.jsx: compile stylex.create away in the build`,
    ).not.toContain("stylex.create");
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

test("the style-prop table uses the build's class prefix", () => {
  expect(stylePropClassPrefix).toBe(LIBRARY_CLASS_PREFIX);
});

test("the style-prop layer holds the style-prop classes and the registrations of their custom properties, each with the library prefix, and nothing else", () => {
  const { inside, outside } = stylePropLayerRules();
  const atRulesInside: string[] = [];
  libraryLayer().walkAtRules((rule) => {
    if (inStylePropLayer(rule)) atRulesInside.push(`@${rule.name} ${rule.params}`);
  });

  expect(inside.length).toBeGreaterThan(0);
  expect(
    inside.filter(
      ({ selector }) => !/^\.[\w-]+$/.test(selector) || !selector.startsWith(stylePropClass),
    ),
  ).toEqual([]);
  expect(outside.filter(({ selector }) => selector.includes(stylePropClass))).toEqual([]);
  expect(
    atRulesInside.filter(
      (rule) =>
        !rule.startsWith("@media ") &&
        !rule.startsWith(`@property ${stylePropCustomProperty}`) &&
        rule !== `@layer ${childRuleLayer}`,
    ),
  ).toEqual([]);
});

test("every custom property a style-prop rule reads is registered once in the style-prop layer, with any syntax and not inherited", () => {
  const read = stylePropLayerRules().inside.flatMap(({ declarations }) =>
    declarations.flatMap((declaration) => /var\((--[\w-]+)\)/.exec(declaration)?.[1] ?? []),
  );
  const registered = registrations();
  const violations = [
    ...read.flatMap((property) => {
      const found = registered.filter(({ params }) => params === property);
      if (found.length !== 1) return [`${property}: register it once, not ${found.length} times.`];
      const [rule] = found;
      return [
        ...(descriptor(rule, "syntax") === '"*"' ? [] : [`${property}: give it syntax "*".`]),
        ...(descriptor(rule, "inherits") === "false"
          ? []
          : [
              `${property}: register it with inherits: false, so an ancestor's value never reaches it.`,
            ]),
        ...(inStylePropLayer(rule)
          ? []
          : [`${property}: register it inside @layer ${STYLE_PROP_LAYER}.`]),
      ];
    }),
    ...registered
      .filter(({ params }) => !read.includes(params))
      .map(({ params }) => `${params}: no style-prop rule reads it; remove its registration.`),
  ];

  expect(read.length).toBeGreaterThan(0);
  expect(violations).toEqual([]);
});

test("an alias writes no rule of its own, so the prop it aliases carries its CSS", () => {
  const aliases = stylePropNames.filter(
    (name) => !canonicalStylePropNames.some((own) => own === name),
  );
  const selectors = stylePropLayerRules().inside.map(({ selector }) => selector);
  const properties = registrations().map(({ params }) => params);

  expect(aliases.length).toBeGreaterThan(0);
  expect(
    aliases.filter((alias) =>
      [...selectors, ...properties].some(
        (written) =>
          written === `${stylePropClass}${alias}` ||
          written.startsWith(`${stylePropClass}${alias}-`) ||
          written === `${stylePropCustomProperty}${alias}` ||
          written.startsWith(`${stylePropCustomProperty}${alias}-`),
      ),
    ),
  ).toEqual([]);
});

test("every rule of a shorthand style prop, at every breakpoint, comes before every rule of a longhand it sets, so the longhand wins", () => {
  const { inside } = stylePropLayerRules();
  const byProperty = new Map<string, number[]>();
  for (const [index, { selector, declarations }] of inside.entries()) {
    const [declaration] = declarations;
    if (!selector.startsWith(stylePropClass) || !declaration?.includes(":var(")) continue;
    const property = declaration.slice(0, declaration.indexOf(":"));
    byProperty.set(property, [...(byProperty.get(property) ?? []), index]);
  }
  const properties = [...byProperty.keys()];
  const pairs = properties.flatMap((shorthand) =>
    properties
      .filter((longhand) => setsEverythingAndMore(shorthand, longhand))
      .map((longhand) => ({ shorthand, longhand })),
  );
  const violations = pairs.flatMap(({ shorthand, longhand }) => {
    const lastShorthand = Math.max(...(byProperty.get(shorthand) ?? []));
    const firstLonghand = Math.min(...(byProperty.get(longhand) ?? []));
    return lastShorthand < firstLonghand
      ? []
      : [
          `packages/core/src/style-prop-table.ts: a ${shorthand} rule comes after a ${longhand} rule, so the shorthand undoes the longhand at that breakpoint. Emit every ${shorthand} rule first.`,
        ];
  });

  expect(pairs.map(({ shorthand, longhand }) => `${shorthand} > ${longhand}`)).toEqual(
    expect.arrayContaining([
      "margin > margin-inline",
      "padding-block > padding-top",
      "inset > top",
      "background > background-size",
      "gap > row-gap",
    ]),
  );
  expect(violations).toEqual([]);
});

test("the built style-prop table imports nothing, so build.mjs can load it in plain Node", () => {
  const file = join(dist, builtStylePropTable);
  const source = parse(file);
  const imports: string[] = [];
  const visit = (node: ts.Node): void => {
    const loadsAModule =
      ts.isImportDeclaration(node) ||
      (ts.isExportDeclaration(node) && node.moduleSpecifier !== undefined) ||
      (ts.isCallExpression(node) &&
        (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
          node.expression.getText(source) === "require"));
    if (loadsAModule) imports.push(node.getText(source));
    node.forEachChild(visit);
  };
  visit(source);

  expect(
    imports,
    "packages/core/src/style-prop-table.ts: remove each import that stays at run time. build.mjs loads this module in plain Node, before the rest of the library is bundled.",
  ).toEqual([]);
});

test("each style prop reads its own custom property, at its base and then at each breakpoint in ascending order", () => {
  const { inside } = stylePropLayerRules();
  const violations = canonicalStylePropNames.flatMap((name) => {
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
            `packages/core/src/style-prop-table.ts: emit ${wanted.join(", ")} in that order for ${name}, not ${written.join(", ")}.`,
          ]),
      ...reads.map(
        ({ selector, declarations }) =>
          `packages/core/src/style-prop-table.ts: ${selector} declares ${declarations.join("; ")}; make it set one property to var(--${selector.slice(1)}).`,
      ),
    ];
  });

  expect(violations).toEqual([]);
});

test("hiddenFrom and visibleFrom hide the element from, or below, each breakpoint, after every style-prop rule", () => {
  const { inside } = stylePropLayerRules();
  const stylePropSelectors = canonicalStylePropNames.flatMap((name) => [
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
    if (!rule) return [`packages/core/src/style-prop-table.ts: emit ${selector}.`];
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

test("every variable is named apart from every other variable and every style-prop class, so its class and custom property are its own", () => {
  const stylePropClasses = [
    ...canonicalStylePropNames.flatMap((name) => [
      `${LIBRARY_CLASS_PREFIX}-${name}`,
      ...breakpoints.map((breakpoint) => `${LIBRARY_CLASS_PREFIX}-${name}-${breakpoint}`),
    ]),
    ...visibilityPropNames.flatMap((name) =>
      breakpoints.map((breakpoint) => visibilityClass(name, breakpoint)),
    ),
  ];
  const variableClasses = variableNames.flatMap((name) =>
    responsiveKeys.map((key) => variableClass(name, key)),
  );

  expect(variableNames.length).toBeGreaterThan(0);
  expect(variableGroups.flatMap(variablesOf)).toHaveLength(variableNames.length);
  expect(variableClasses.filter((found) => stylePropClasses.includes(found))).toEqual([]);
});

test("each variable sets the property its row names, or else the custom property named for it, from its own custom property, at its base and, when it is responsive, then at each breakpoint in ascending order", () => {
  const { inside } = stylePropLayerRules();
  const violations = variableNames.flatMap((name) => {
    const property = variableRow(name).property ?? `--${name}`;
    const keys = variableRow(name).responsive ? ownerBreakpoints : [];
    const expected = [
      { selector: `.${variableClass(name, "base")}`, media: undefined },
      ...keys.map(([breakpoint, width]) => ({
        selector: `${stylePropClass}${name}-${breakpoint}`,
        media: `(min-width: ${width})`,
      })),
    ];
    const found = inside.filter(({ selector }) =>
      responsiveKeys.some((key) => selector === `.${variableClass(name, key)}`),
    );
    const written = found.map(
      ({ selector, media }) => `${selector} in ${media ?? "no media query"}`,
    );
    const wanted = expected.map(
      ({ selector, media }) => `${selector} in ${media ?? "no media query"}`,
    );
    const reads = found.filter(
      ({ selector, declarations }) =>
        JSON.stringify(declarations) !==
        JSON.stringify([`${property}:var(--${selector.slice(1)})`]),
    );
    return [
      ...(JSON.stringify(written) === JSON.stringify(wanted)
        ? []
        : [
            `packages/core/src/style-prop-table.ts: emit ${wanted.join(", ")} for ${name}, not ${written.join(", ")}.`,
          ]),
      ...reads.map(
        ({ selector, declarations }) =>
          `${selector} declares ${declarations.join("; ")}; make it set ${property} to var(--${selector.slice(1)}).`,
      ),
    ];
  });

  expect(violations).toEqual([]);
});

test("the child rules sit in a layer nested in the style-prop layer, before its own rules, so a style prop on a child beats them, and each styles only the children of an element that carries a variable's class", () => {
  const order = nestedLayerOrder(
    (() => {
      let found: postcss.AtRule | undefined;
      libraryLayer().walkAtRules("layer", (rule) => {
        if (rule.params === STYLE_PROP_LAYER) found = rule;
      });
      if (!found)
        throw new Error(`packages/core/dist/styles.css: emit @layer ${STYLE_PROP_LAYER}.`);
      return found;
    })(),
  );
  const { childRules } = stylePropLayerRules();
  const variableClasses = variableNames.map((name) => `.${variableClass(name, "base")}`);

  expect(order).toEqual([childRuleLayer]);
  expect(
    childRules.filter(
      ({ selector }) =>
        !variableClasses.some((variable) => selector.startsWith(variable)) || !/ > /.test(selector),
    ),
  ).toEqual([]);
});

test("every variable that sets a custom property of its own is read by a component's compiled styles or by a child rule", () => {
  const { outside, childRules } = stylePropLayerRules();
  const readers = [...outside, ...childRules].flatMap(({ declarations }) => declarations);
  const unread = variableNames
    .filter((name) => variableRow(name).property === undefined)
    .filter((name) => !readers.some((declaration) => declaration.includes(`var(--${name})`)));

  expect(unread).toEqual([]);
});
