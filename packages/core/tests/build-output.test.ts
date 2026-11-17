import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import postcss from "postcss";
import { expect, test } from "vite-plus/test";
import {
  BEHAVIOUR_SDK_LAYER,
  behaviourSdkHiddenRule,
  HIDDEN_LAYER,
  LIBRARY_CASCADE_LAYER,
  LIBRARY_CLASS_PREFIX,
  sdkHiddenRuleSource,
  STYLE_PROP_LAYER,
} from "../build-pipeline.mjs";
import {
  breakpoints,
  canonicalStylePropNames,
  childRuleLayer,
  componentLayer,
  containerQueryLayer,
  layerOrder,
  libraryLayerOrder,
  outerLayerOrder,
  responsiveKeys,
  stylePropNames,
  variableClass,
  variableGroups,
  variableNames,
  variableRow,
  variablesOf,
  visibilityClass,
  visibilityPropNames,
} from "../src/style-prop-table";
import { stableClassPrefix } from "../src/stable-class";
import { builtComponents, builtSource, dist, stylesheet as builtStylesheet } from "./built-library";
import { parse, ts } from "../../../scripts/syntax";
import {
  enclosingAtRules,
  inChildRuleLayer,
  inStylePropLayer,
  layersAroundDeclaration,
  nestedLayerOrder,
} from "./cascade-layers";

const stylesheet = builtStylesheet.trim();
const realHiddenRule = behaviourSdkHiddenRule(join(import.meta.dirname, ".."));
const libraryPartCondition = `:where([class^="${stableClassPrefix}"], [class*=" ${stableClassPrefix}"])`;
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

function sdkSelectors(): string[] {
  const selectors: string[] = [];
  postcss.parse(realHiddenRule).walkRules((rule) => {
    selectors.push(rule.selector);
  });
  return selectors;
}

test("the stylesheet first orders the behaviour SDK's layer before the library's, then holds the rule the SDK writes at run time to keep a hidden part hidden, read from the SDK's package and narrowed to an element with a class that starts with the stable class prefix, and then every other rule inside the one library cascade layer", () => {
  const [selector, ...others] = sdkSelectors();
  const narrowed = realHiddenRule.replace(selector, `${selector}${libraryPartCondition}`);
  const order = `@layer ${BEHAVIOUR_SDK_LAYER}, ${LIBRARY_CASCADE_LAYER};\n${narrowed}\n`;
  const layer = stylesheet.slice(order.length);

  expect(others).toEqual([]);
  expect(stylesheet.startsWith(order)).toBe(true);
  expect(layer.startsWith(`@layer ${LIBRARY_CASCADE_LAYER} {`)).toBe(true);

  const depths = depthAfterEachCharacter(layer);
  const firstBrace = layer.indexOf("{");
  const positionsBackAtTopLevel = depths
    .map((depth, position) => (position >= firstBrace && depth === 0 ? position : -1))
    .filter((position) => position !== -1);

  expect(positionsBackAtTopLevel).toEqual([layer.length - 1]);
});

test("every class name carries the library's own prefix", () => {
  const classNames = stylesheet.match(/\.[A-Za-z_][\w-]*/g) ?? [];

  const stylexDefaultPrefix = "x";

  expect(LIBRARY_CLASS_PREFIX).not.toBe(stylexDefaultPrefix);
  expect(classNames.length).toBeGreaterThan(0);
  expect(classNames.filter((name) => !name.startsWith(`.${LIBRARY_CLASS_PREFIX}`))).toEqual([]);
});

test("every declaration marked important sits in the SDK's layer and none in the library's layer, so no rule in `solix` can outrank a consumer", () => {
  const outsideTheSdkLayer: string[] = [];
  postcss.parse(stylesheet).walkDecls((declaration) => {
    const layers = layersAroundDeclaration(declaration);
    if (declaration.important && layers.at(-1) !== BEHAVIOUR_SDK_LAYER) {
      outsideTheSdkLayer.push(
        `${layers.toReversed().join(" > ") || "no layer"}: ${declaration.toString()}`,
      );
    }
  });

  expect(outsideTheSdkLayer).toEqual([]);
});

function sdkWhoseHiddenWriterIs(body: string): string {
  const packageRoot = mkdtempSync(join(tmpdir(), "sdk-hidden-rule-"));
  const module = join(
    packageRoot,
    "node_modules",
    sdkHiddenRuleSource.dependency,
    sdkHiddenRuleSource.module,
  );
  mkdirSync(dirname(module), { recursive: true });
  writeFileSync(module, `function ${sdkHiddenRuleSource.writer}(doc) {\n${body}\n}\n`);
  return packageRoot;
}

test.each([
  [
    "a rule built by concatenation",
    'const at = ":where([hidden])"; writeStyle(doc, "id", "@layer ui-sdk { " + at + " { display: none !important } }");',
  ],
  [
    "a rule built from a template with a substitution",
    'const at = ":where([hidden])"; writeStyle(doc, "id", `@layer ui-sdk { ${at} { display: none !important } }`);',
  ],
  [
    "two writes",
    'writeStyle(doc, "a", "@layer ui-sdk { a { display: none !important } }"); writeStyle(doc, "b", "@layer ui-sdk { b { display: none !important } }");',
  ],
  [
    "two rules in one layer",
    'writeStyle(doc, "id", "@layer ui-sdk { a { display: none !important } b { display: none !important } }");',
  ],
  [
    "a second declaration",
    'writeStyle(doc, "id", "@layer ui-sdk { :where([data-part][hidden]) { display: none !important; content-visibility: hidden !important } }");',
  ],
  [
    "a declaration that is not important",
    'writeStyle(doc, "id", "@layer ui-sdk { :where([hidden]) { display: none } }");',
  ],
  [
    "another layer",
    'writeStyle(doc, "id", "@layer other { :where([hidden]) { display: none !important } }");',
  ],
  ["no layer", 'writeStyle(doc, "id", ":where([hidden]) { display: none !important }");'],
  [
    "an unclosed layer",
    'writeStyle(doc, "id", "@layer ui-sdk { :where([hidden]) { display: none !important }");',
  ],
  ["nothing", "return doc;"],
])("the build refuses the SDK's hidden rule when its writer holds %s", (_, body) => {
  expect(() => behaviourSdkHiddenRule(sdkWhoseHiddenWriterIs(body))).toThrow(
    `${sdkHiddenRuleSource.writer} writes`,
  );
});

test("the build takes the SDK's hidden rule when its writer holds one closed layer block of one rule that declares only display none important, whatever its selector", () => {
  const rule = `@layer ${BEHAVIOUR_SDK_LAYER} { :where([data-part][hidden]) { display: none !important } }`;

  expect(
    behaviourSdkHiddenRule(
      sdkWhoseHiddenWriterIs(`writeStyle(doc, "id", ${JSON.stringify(rule)});`),
    ),
  ).toBe(rule);
  expect(realHiddenRule.startsWith(`@layer ${BEHAVIOUR_SDK_LAYER} {`)).toBe(true);
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

test("the library layer ranks its components, then its style props, then the container queries a component writes at run time, and the hidden layer last", () => {
  expect(nestedLayerOrder(libraryLayer())).toEqual([
    componentLayer,
    STYLE_PROP_LAYER,
    containerQueryLayer,
    HIDDEN_LAYER,
  ]);
});

test("the hidden layer holds one rule, display none on a hidden element with a class that starts with the stable class prefix, unless it is hidden until found", () => {
  const rules: string[] = [];
  libraryLayer().walkAtRules("layer", (layer) => {
    if (layer.params !== HIDDEN_LAYER) return;
    layer.walkRules((rule) => {
      rules.push(`${rule.selector}{${rule.nodes.map((node) => node.toString()).join(";")}}`);
    });
  });

  expect(rules).toEqual([
    `[hidden]${libraryPartCondition}:not([hidden="until-found"]){display:none}`,
  ]);
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

test("each variable sets the custom property named for it from its own --sx- custom property, at its base and, when it is responsive, then at each breakpoint in ascending order", () => {
  const { inside } = stylePropLayerRules();
  const violations = variableNames.flatMap((name) => {
    const property = `--${name}`;
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

type ParsedSelector = { compounds: string[]; combinators: string[]; list: boolean };

function parseSelector(selector: string): ParsedSelector {
  const compounds = [""];
  const combinators: string[] = [];
  let depth = 0;
  let quote: string | undefined;
  let pending: string | undefined;
  let list = false;
  for (const character of selector) {
    if (quote !== undefined) {
      if (character === quote) quote = undefined;
    } else if (character === '"' || character === "'") {
      quote = character;
    } else if (character === "[" || character === "(") {
      depth += 1;
    } else if (character === "]" || character === ")") {
      depth -= 1;
    } else if (depth === 0 && character === ",") {
      list = true;
      continue;
    } else if (depth === 0 && /[\s>+~]/.test(character)) {
      pending = (pending ?? "") + character;
      continue;
    }
    if (pending !== undefined) {
      combinators.push(pending.trim() === "" ? " " : pending.trim());
      compounds.push("");
      pending = undefined;
    }
    compounds[compounds.length - 1] += character;
  }
  return { compounds, combinators, list };
}

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

test("the stylesheet first ranks the SDK's layer before the library's, and the library layer first names its sub-layers in the order it ranks them, the hidden layer last: the two statements a component's run-time rules start with. StyleX's layers sit in the first sub-layer", () => {
  const statement = (node: postcss.ChildNode | undefined) =>
    node?.type === "atrule" ? `@layer ${node.params};` : node?.toString();
  const [opening] = postcss.parse(stylesheet).nodes;
  const [first] = libraryLayer().nodes ?? [];
  let components: postcss.AtRule | undefined;
  libraryLayer().each((node) => {
    if (node.type === "atrule" && node.name === "layer" && node.params === componentLayer) {
      components = node;
    }
  });

  expect(statement(opening)).toBe(outerLayerOrder);
  expect(statement(first)).toBe(libraryLayerOrder);
  expect(layerOrder.startsWith(outerLayerOrder) && layerOrder.includes(libraryLayerOrder)).toBe(
    true,
  );
  expect(components && nestedLayerOrder(components).length).toBeGreaterThan(0);
});

test("every variable's custom property is read by a component's compiled styles or by a child rule", () => {
  const { outside, childRules } = stylePropLayerRules();
  const readers = [...outside, ...childRules].flatMap(({ declarations }) => declarations);
  const unread = variableNames.filter(
    (name) => !readers.some((declaration) => declaration.includes(`var(--${name})`)),
  );

  expect(unread).toEqual([]);
});
