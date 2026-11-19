import { readdirSync } from "node:fs";
import { join } from "node:path";
import type postcss from "postcss";
import { expect, test } from "vite-plus/test";
import { LIBRARY_CLASS_PREFIX, STYLE_PROP_LAYER, VARIABLES_MODULE } from "#/build-pipeline.mjs";
import {
  breakpoints,
  canonicalStylePropNames,
  responsiveKeys,
  stylePropNames,
  variableClass,
  visibilityClasses,
} from "#/src/style-prop-table.ts";
import { childRuleLayer } from "#/src/layers.ts";
import { dist, variableNames, variableRows } from "#/tests/built-library.ts";
import { inStylePropLayer, nestedLayerOrder } from "#/tests/cascade-layers.ts";

import {
  ownerBreakpoints,
  stylePropClass,
  stylePropCustomProperty,
  builtStylePropTable,
  builtLayers,
  builtVariablesModule,
  libraryLayer,
  registrations,
  descriptor,
  setsEverythingAndMore,
  stylePropLayerRules,
  runTimeImportsOf,
  parseSelector,
} from "#/tests/built-stylesheet.ts";

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
  expect(
    outside.filter(
      ({ selector, inColorSchemeLayer }) =>
        selector.includes(stylePropClass) && !inColorSchemeLayer,
    ),
  ).toEqual([]);
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
    ]),
  );
  expect(violations).toEqual([]);
});

test("the built style-prop table imports only the layer registry, which imports nothing, and each built Component.variables.js imports only defineVariables from the variables module, which imports nothing, so build.mjs can load them in plain Node", () => {
  const variablesModules = readdirSync(dist).filter((entry) => VARIABLES_MODULE.test(entry));

  expect(
    runTimeImportsOf(join(dist, builtStylePropTable)),
    "packages/core/src/style-prop-table.ts: import only the layer registry at run time. build.mjs loads this module in plain Node, before the rest of the library is bundled.",
  ).toEqual([`import { childRuleLayer } from "./${builtLayers}";`]);
  for (const plain of [builtLayers, builtVariablesModule]) {
    expect(
      runTimeImportsOf(join(dist, plain)),
      `packages/core/src/${plain.replace(/\.js$/, ".ts")}: remove each import that stays at run time. build.mjs loads this module in plain Node, before the rest of the library is bundled.`,
    ).toEqual([]);
  }
  expect(variablesModules.length).toBeGreaterThan(0);
  for (const entry of variablesModules) {
    expect(
      runTimeImportsOf(join(dist, entry)),
      `packages/core/src/${entry.replace(/\.js$/, ".ts")}: import only defineVariables from the variables module at run time. build.mjs loads this module in plain Node, before the rest of the library is bundled.`,
    ).toEqual([`import { defineVariables } from "./${builtVariablesModule}";`]);
  }
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
    ...visibilityClasses,
  ];
  const variableClasses = variableNames.flatMap((name) =>
    responsiveKeys.map((key) => variableClass(name, key)),
  );

  expect(variableNames.length).toBeGreaterThan(0);
  expect(new Set(variableNames).size).toBe(variableNames.length);
  expect(variableClasses.filter((found) => stylePropClasses.includes(found))).toEqual([]);
});

test("each variable sets the custom property named for it from its own --sx- custom property, at its base and, when it is responsive, then at each breakpoint in ascending order", () => {
  const { inside } = stylePropLayerRules();
  const violations = variableRows.flatMap(({ name, row }) => {
    const property = `--${name}`;
    const keys = row.responsive ? ownerBreakpoints : [];
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

test("each child rule is one selector, from an element that carries a variable's class to its children, or to the children of a child one attribute selector names, joined by > alone, in a layer nested first in the style-prop layer, so a style prop on a child beats it", () => {
  let styleProps: postcss.AtRule | undefined;
  libraryLayer().walkAtRules("layer", (rule) => {
    if (rule.params === STYLE_PROP_LAYER) styleProps = rule;
  });
  const { childRules } = stylePropLayerRules();
  const variableClasses = variableNames.map((name) => variableClass(name, "base"));
  const problems = childRules.flatMap(({ selector }) => {
    const { compounds, combinators, list } = parseSelector(selector);
    const [owner = "", child, grandchild] = compounds;
    const carrier = /^\.([\w-]+)/.exec(owner)?.[1];
    return [
      ...(list ? [`${selector}: write one selector, not a list.`] : []),
      ...(combinators.every((combinator) => combinator === ">")
        ? []
        : [`${selector}: join its compound selectors with > alone.`]),
      ...(carrier !== undefined && variableClasses.includes(carrier)
        ? []
        : [`${selector}: start from the class of a variable.`]),
      ...(child === undefined ||
      compounds.length > 3 ||
      (grandchild !== undefined && !/^\[[^\]]+\]$/.test(child))
        ? [
            `${selector}: style the children, or the children of a child one attribute selector names, and no deeper.`,
          ]
        : []),
    ];
  });

  expect(styleProps && nestedLayerOrder(styleProps)).toEqual([childRuleLayer]);
  expect(childRules.length).toBeGreaterThan(0);
  expect(problems).toEqual([]);
});

test("every variable's custom property is read by a component's compiled styles or by a child rule", () => {
  const { outside, childRules } = stylePropLayerRules();
  const readers = [...outside, ...childRules].flatMap(({ declarations }) => declarations);
  const unread = variableNames.filter(
    (name) => !readers.some((declaration) => declaration.includes(`var(--${name})`)),
  );

  expect(unread).toEqual([]);
});
