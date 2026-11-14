import { readFileSync } from "node:fs";
import { join } from "node:path";
import { type JSX, renderToString, type ValidComponent } from "@solidjs/web";
import fc from "fast-check";
import postcss from "postcss";
import type { Component } from "solid-js";
import ts from "typescript";
import { expect, test } from "vite-plus/test";
import { tokenValues } from "../../../scripts/tokens";
import { LIBRARY_CLASS_PREFIX, STYLE_PROP_LAYER } from "../build-pipeline.mjs";
import type * as Library from "../src/index";
import {
  baseKey,
  breakpoints,
  canonicalOf,
  responsiveKeys,
  type StylePropName,
  stylePropNames,
  stylePropTable,
  visibilityPropNames,
} from "../src/style-prop-table";
import { builtComponents } from "./built-components";

type ConsumerProps = Record<string, unknown>;
type Attributes = [string, string | true][];
type Element = { tag: string; attributes: Attributes };

const dist = join(import.meta.dirname, "../dist");
const library = (await import(join(dist, "index.js"))) as typeof Library;
const builtByName: Record<string, unknown> = library;
const generatedRuns = 300;
const repositoryRoot = join(import.meta.dirname, "../../..");
const contractSkill = ".agents/skills/verify-component-contract/SKILL.md";
const rootPart = "root";
const stylesApiProps = ["classes", "styles", "unstyled"];
const classProp = "the class prop";

function renderBuilt(name: string, props: ConsumerProps): string {
  const built = builtByName[name];
  if (typeof built !== "function") {
    throw new Error(`packages/core/dist/index.js: export the component ${name}.`);
  }
  const Built = built as Component<ConsumerProps>;
  return renderToString(() => <Built {...props} />);
}

const rootOf: {
  [Name in keyof typeof Library]: {
    tag: string;
    booleanAttribute: string;
    render: (props: ConsumerProps) => string;
  };
} = {
  Box: {
    tag: "div",
    booleanAttribute: "hidden",
    render: (props) => renderBuilt("Box", { children: "Content", ...props }),
  },
  Button: {
    tag: "button",
    booleanAttribute: "disabled",
    render: (props) => renderBuilt("Button", { children: "Label", ...props }),
  },
  Disclosure: {
    tag: "details",
    booleanAttribute: "open",
    render: (props) => renderBuilt("Disclosure", { label: "Label", children: "Content", ...props }),
  },
  Modal: {
    tag: "dialog",
    booleanAttribute: "hidden",
    render: (props) =>
      renderBuilt("Modal", { label: "Label", opened: false, children: "Content", ...props }),
  },
  TextInput: {
    tag: "input",
    booleanAttribute: "disabled",
    render: (props) => renderBuilt("TextInput", props),
  },
};

function inStylePropLayer(node: postcss.Node): boolean {
  const parent = node.parent;
  if (!(parent instanceof postcss.AtRule)) return false;
  return (
    (parent.name === "layer" && parent.params === STYLE_PROP_LAYER) || inStylePropLayer(parent)
  );
}

function styleXClassesInTheStylesheet(): Set<string> {
  const found = new Set<string>();
  postcss.parse(readFileSync(join(dist, "styles.css"), "utf8")).walkRules((rule) => {
    if (inStylePropLayer(rule)) return;
    for (const [, name] of rule.selector.matchAll(/\.([\w-]+)/g)) found.add(name);
  });
  return found;
}

const styleXClasses = styleXClassesInTheStylesheet();

function emitsStyleXClass(component: string): boolean {
  return [...readFileSync(join(dist, `${component}.jsx`), "utf8").matchAll(/[\w-]+/g)].some(
    ([word]) => styleXClasses.has(word),
  );
}

const consumerToken = fc
  .stringMatching(/^[a-z][a-z0-9-]{0,8}$/)
  .filter((token) => !token.startsWith(LIBRARY_CLASS_PREFIX) && !token.startsWith("solix"));

const writtenAs = fc.constantFrom("string", "array item", "object key");

const classTokens = fc.uniqueArray(
  fc.record({ token: consumerToken, applied: fc.boolean(), writtenAs }),
  { maxLength: 6, selector: ({ token }) => token },
);

type ClassToken = { token: string; applied: boolean; writtenAs: string };

function classValueFrom(tokens: ClassToken[]): JSX.ClassValue {
  const written = (shape: string) => tokens.filter(({ writtenAs: as }) => as === shape);
  const asString = written("string")
    .filter(({ applied }) => applied)
    .map(({ token }) => token)
    .join(" ");
  const asArrayItems = written("array item").map(({ token, applied }) => applied && token);
  const asObject = Object.fromEntries(
    written("object key").map(({ token, applied }) => [token, applied]),
  );
  return [asString, asArrayItems, asObject];
}

const stringAttributes = fc.record(
  {
    id: consumerToken,
    title: consumerToken,
    "aria-label": consumerToken,
    "data-state": consumerToken,
  },
  { requiredKeys: [] },
);

const startTag = /<([a-z][a-z0-9-]*)((?:\s+[^\s=>]+(?:=(?:"[^"]*"|[^\s">]+))?)*)\s*\/?>/g;

function attributesIn(written: string): Attributes {
  return [...written.matchAll(/\s+([^\s=>]+)(?:=(?:"([^"]*)"|([^\s">]+)))?/g)].map(
    ([, name, quoted, bare]): [string, string | true] => [name, quoted ?? bare ?? true],
  );
}

function elementsOf(html: string): Element[] {
  return [...html.matchAll(startTag)].map(([, tag, written]) => ({
    tag,
    attributes: attributesIn(written),
  }));
}

function rootElementOf(html: string): Element {
  const [root] = elementsOf(html);
  if (!root || !html.startsWith(`<${root.tag}`)) {
    throw new Error(`The rendered markup does not start with an element: ${html}`);
  }
  return root;
}

function valuesOf(element: Element, attribute: string): (string | true)[] {
  return element.attributes.filter(([found]) => found === attribute).map(([, value]) => value);
}

function classesOf(element: Element): string[] {
  return String(valuesOf(element, "class")[0] ?? "")
    .split(/\s+/)
    .filter((found) => found !== "");
}

function declarationsIn(style: string | true | undefined): [string, string][] {
  if (typeof style !== "string") return [];
  return style
    .split(";")
    .filter((declaration) => declaration.trim() !== "")
    .map((declaration): [string, string] => {
      const colon = declaration.indexOf(":");
      return [declaration.slice(0, colon).trim(), declaration.slice(colon + 1).trim()];
    });
}

function partsOn(component: string, element: Element): string[] {
  const stable = new RegExp(`^solix-${component}-([a-z][A-Za-z0-9]*)$`);
  return classesOf(element).flatMap((found) => stable.exec(found)?.[1] ?? []);
}

function partsOf(component: string): string[] {
  return elementsOf(renderBuilt(component, {})).flatMap((element) => partsOn(component, element));
}

const partsByComponent = new Map(builtComponents.map((name) => [name, partsOf(name)]));

function partsOfBuilt(component: string): string[] {
  return partsByComponent.get(component) ?? [];
}

const stylesApiComponents = builtComponents.filter(
  (name) => emitsStyleXClass(name) || partsOfBuilt(name).length > 1,
);

function styledPartsInTheBuild(component: string): string[] {
  const file = join(dist, `${component}.jsx`);
  const source = ts.createSourceFile(
    file,
    readFileSync(file, "utf8"),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.JSX,
  );
  return source.statements
    .filter(ts.isVariableStatement)
    .flatMap((statement) =>
      statement.declarationList.declarations.flatMap((declaration) =>
        declaration.name.getText() === "styles" &&
        declaration.initializer !== undefined &&
        ts.isObjectLiteralExpression(declaration.initializer)
          ? declaration.initializer.properties.flatMap((property) =>
              property.name && ts.isIdentifier(property.name) ? [property.name.text] : [],
            )
          : [],
      ),
    );
}

function stylesApiAttributesOn(html: string): string[] {
  return elementsOf(html).flatMap(({ tag, attributes }) =>
    attributes
      .filter(([name]) => stylesApiProps.includes(name.toLowerCase()))
      .map(([name]) => `<${tag}> ${name}`),
  );
}

test("every component the library exports is held to the root contract", () => {
  const exportedComponents = Object.entries(library)
    .filter(([, exported]) => typeof exported === "function")
    .map(([name]) => name);

  expect(exportedComponents.sort()).toEqual(Object.keys(rootOf).sort());
  expect(builtComponents).toEqual(Object.keys(rootOf).sort());
});

test.each(Object.entries(rootOf))(
  "%s puts every class and attribute a consumer passes on its root, next to its own classes",
  (name, component) => {
    const hasDefaultStyles = emitsStyleXClass(name);
    fc.assert(
      fc.property(classTokens, stringAttributes, fc.boolean(), (tokens, attributes, flag) => {
        const html = component.render({
          class: classValueFrom(tokens),
          ...attributes,
          [component.booleanAttribute]: flag,
        });
        const root = rootElementOf(html);
        const classes = classesOf(root);

        expect(root.tag).toBe(component.tag);
        expect(valuesOf(root, "class")).toHaveLength(1);
        expect(classes).toContain(`solix-${name}-root`);
        expect(
          classes.some((found) => found.startsWith(LIBRARY_CLASS_PREFIX)),
          `the built ${name} ${hasDefaultStyles ? "emits" : "emits no"} StyleX class, so its root carries ${hasDefaultStyles ? "one" : "none"} of the library's style classes`,
        ).toBe(hasDefaultStyles);
        for (const { token, applied } of tokens) {
          expect(classes.includes(token), `class "${token}"`).toBe(applied);
        }
        for (const [attribute, value] of Object.entries(attributes)) {
          expect(valuesOf(root, attribute), attribute).toEqual([value]);
        }
        expect(valuesOf(root, component.booleanAttribute)).toEqual(flag ? [true] : []);
      }),
      { numRuns: generatedRuns },
    );
  },
);

test.each(builtComponents)(
  "%s marks the root and each part its built styles object names with one stable class on one element, the root first",
  (name) => {
    const elements = elementsOf(renderBuilt(name, {}));
    const parts = partsOfBuilt(name);

    expect(partsOn(name, elements[0]), "the first element is the root").toEqual([rootPart]);
    expect(
      elements.filter((element) => partsOn(name, element).length > 1),
      "an element carries one part",
    ).toEqual([]);
    expect(parts, "a part names one element").toEqual([...new Set(parts)]);
    expect(
      [...parts].sort(),
      `every part the built styles object of ${name} styles, and the root, is rendered with its stable class`,
    ).toEqual([...new Set([rootPart, ...styledPartsInTheBuild(name)])].sort());
  },
);

test("a component with a default style or more than one part takes classes, styles and unstyled", () => {
  expect(stylesApiComponents.length).toBeGreaterThan(0);
  expect(
    builtComponents.filter((name) => !stylesApiComponents.includes(name)),
    "only a component with one unstyled root, Box, leaves them out",
  ).toEqual(["Box"]);
});

type PartClassToken = ClassToken & { target: string };

function partClassTokens(parts: string[]): fc.Arbitrary<PartClassToken[]> {
  return fc.uniqueArray(
    fc.record({
      target: fc.constantFrom(...parts, classProp),
      token: consumerToken,
      applied: fc.boolean(),
      writtenAs,
    }),
    { maxLength: 12, selector: ({ token }) => token },
  );
}

function classesPropsFrom(parts: string[], tokens: PartClassToken[]): ConsumerProps {
  const of = (target: string) => tokens.filter((token) => token.target === target);
  return {
    classes: Object.fromEntries(
      parts.filter((part) => of(part).length > 0).map((part) => [part, classValueFrom(of(part))]),
    ),
    class: classValueFrom(of(classProp)),
  };
}

function expectClassesOnTheirParts(name: string, html: string, tokens: PartClassToken[]): void {
  const given = tokens.map(({ token }) => token);
  for (const element of elementsOf(html)) {
    const [part] = partsOn(name, element);
    const where = part === undefined ? `<${element.tag}>, which is no part` : `the ${part} part`;
    const ownTokens = tokens.filter(({ target }) => target === part).map(({ token }) => token);
    const classTokensOnRoot = tokens
      .filter(({ target }) => part === rootPart && target === classProp)
      .map(({ token }) => token);
    const wanted = tokens.filter(
      ({ token, applied }) =>
        applied && (ownTokens.includes(token) || classTokensOnRoot.includes(token)),
    );
    const classes = classesOf(element);
    const rank = (found: string): number[] => {
      if (styleXClasses.has(found)) return [0];
      if (found === `solix-${name}-${part}`) return [1];
      if (ownTokens.includes(found)) return [2];
      return classTokensOnRoot.includes(found) ? [3] : [];
    };
    const ranks = classes.flatMap(rank);

    expect(
      classes.filter((found) => given.includes(found)).sort(),
      `the consumer's classes on ${where}`,
    ).toEqual(wanted.map(({ token }) => token).sort());
    expect(
      ranks,
      `on ${where}, the library's classes come first, then the stable class, then classes.${part}, and on the root the class prop last`,
    ).toEqual([...ranks].sort((before, after) => before - after));
  }
  expect(stylesApiAttributesOn(html), "classes, styles and unstyled reach no element").toEqual([]);
}

test.each(stylesApiComponents)(
  "%s puts a class that classes names for a part on exactly that part's element, after the library's classes and the stable class, and the class prop after classes.root",
  (name) => {
    const parts = partsOfBuilt(name);
    fc.assert(
      fc.property(partClassTokens(parts), (tokens) => {
        const html = renderBuilt(name, classesPropsFrom(parts, tokens));

        expect(partsOf(name)).toEqual(parts);
        expectClassesOnTheirParts(name, html, tokens);
      }),
      { numRuns: generatedRuns },
    );
  },
);

const consumerValues = {
  color: fc.constantFrom("red", "blue", "green"),
  "margin-top": fc.integer({ min: 1, max: 9 }).map((pixels) => `${pixels}px`),
  "--consumer-gap": fc.integer({ min: 1, max: 9 }).map((pixels) => `${pixels}px`),
};

const declarationSet: fc.Arbitrary<[string, string][]> = fc
  .tuple(
    ...Object.entries(consumerValues).map(([property, value]) =>
      fc.option(
        value.map((written): [string, string] => [property, written]),
        { nil: undefined },
      ),
    ),
  )
  .map((declarations) => declarations.filter((found) => found !== undefined));

function declarationsByPart(parts: string[]): fc.Arbitrary<Record<string, [string, string][]>> {
  return fc
    .tuple(
      ...parts.map((part) =>
        fc.option(
          declarationSet.map((declarations): [string, [string, string][]] => [part, declarations]),
          { nil: undefined },
        ),
      ),
    )
    .map((entries) => Object.fromEntries(entries.filter((entry) => entry !== undefined)));
}

function styleWritten(declarations: [string, string][], as: string): ConsumerProps {
  if (as === "absent") return {};
  return {
    style:
      as === "string"
        ? declarations.map(([property, value]) => `${property}: ${value}`).join("; ")
        : Object.fromEntries(declarations),
  };
}

test.each(stylesApiComponents)(
  "%s puts the declarations styles names for a part in exactly that part's style, and the consumer's style after styles.root",
  (name) => {
    const parts = partsOfBuilt(name);
    fc.assert(
      fc.property(
        declarationsByPart(parts),
        declarationSet,
        fc.constantFrom("object", "string", "absent"),
        fc.boolean(),
        (byPart, consumerStyle, styleAs, unstyled) => {
          const html = renderBuilt(name, {
            styles: Object.fromEntries(
              Object.entries(byPart).map(([part, declarations]) => [
                part,
                Object.fromEntries(declarations),
              ]),
            ),
            ...styleWritten(consumerStyle, styleAs),
            unstyled,
          });
          const consumerGave = styleAs === "absent" ? [] : consumerStyle;

          for (const element of elementsOf(html)) {
            const [part] = partsOn(name, element);
            const wanted = [
              ...((part === undefined ? undefined : byPart[part]) ?? []),
              ...(part === rootPart ? consumerGave : []),
            ];
            expect(valuesOf(element, "style").length).toBeLessThanOrEqual(1);
            expect(
              Object.fromEntries(declarationsIn(valuesOf(element, "style")[0])),
              part === undefined
                ? `<${element.tag}>, which is no part, has no style`
                : `the ${part} part's style holds styles.${part}${part === rootPart ? " and then the consumer's style, which wins" : ""}`,
            ).toEqual(Object.fromEntries(wanted));
          }
          expect(
            stylesApiAttributesOn(html),
            "classes, styles and unstyled reach no element",
          ).toEqual([]);
        },
      ),
      { numRuns: generatedRuns },
    );
  },
);

test.each(stylesApiComponents)(
  "%s with unstyled drops every class the stylesheet defines outside the style-props layer, from every part, and keeps every stable part class and every consumer class",
  (name) => {
    const parts = partsOfBuilt(name);
    fc.assert(
      fc.property(partClassTokens(parts), (tokens) => {
        const html = renderBuilt(name, { ...classesPropsFrom(parts, tokens), unstyled: true });
        const elements = elementsOf(html);

        expect(
          elements.flatMap((element) =>
            classesOf(element)
              .filter((found) => styleXClasses.has(found))
              .map((found) => `${found} on <${element.tag}>`),
          ),
          "no library style class",
        ).toEqual([]);
        expect(
          elements.flatMap((element) => partsOn(name, element)),
          "every stable part class, on the same elements in the same order",
        ).toEqual(parts);
        expectClassesOnTheirParts(name, html, tokens);
      }),
      { numRuns: generatedRuns },
    );
  },
);

type BoxPropsFor<T extends ValidComponent> = Parameters<typeof Library.Box<T>>[0];

const own = (suffix: string) => `${LIBRARY_CLASS_PREFIX}-${suffix}`;

const resolvedCases: [
  what: string,
  props: BoxPropsFor<"div">,
  classes: string[],
  style: Record<string, string>,
][] = [
  ["a number is pixels, written in rem", { mt: 16 }, [own("mt")], { [`--${own("mt")}`]: "1rem" }],
  [
    "a colour scale key reads its token",
    { bg: "error" },
    [own("bg")],
    { [`--${own("bg")}`]: "var(--solix-color-error)" },
  ],
  [
    "a CSS-wide keyword passes through",
    { c: "inherit" },
    [own("c")],
    { [`--${own("c")}`]: "inherit" },
  ],
  [
    "a number for a property that is not a length stays a number",
    { opacity: 0.5 },
    [own("opacity")],
    { [`--${own("opacity")}`]: "0.5" },
  ],
  [
    "a responsive value sets its base and each breakpoint it names",
    { p: { base: "xs", md: "lg" } },
    [own("p"), own("p-md")],
    {
      [`--${own("p")}`]: "var(--solix-spacing-xs)",
      [`--${own("p-md")}`]: "var(--solix-spacing-lg)",
    },
  ],
  [
    "an alias sets the class and property of the prop it aliases",
    { mis: 8 },
    [own("ms")],
    { [`--${own("ms")}`]: "0.5rem" },
  ],
  ["hiddenFrom adds its class and no property", { hiddenFrom: "md" }, [own("hidden-from-md")], {}],
  [
    "null is the same as leaving the prop out",
    { mt: null, p: { base: null, md: 4 }, hiddenFrom: null },
    [own("p-md")],
    { [`--${own("p-md")}`]: "0.25rem" },
  ],
  ["a value that holds a semicolon is dropped", { c: "red; background: blue" }, [], {}],
  [
    "a value that holds a brace is dropped at its own breakpoint only",
    { m: { base: "1px}", md: "{", lg: 4 } },
    [own("m-lg")],
    { [`--${own("m-lg")}`]: "0.25rem" },
  ],
];

test.each(resolvedCases)("Box: %s", (_, props, expectedClasses, expectedStyle) => {
  const root = rootElementOf(rootOf.Box.render(props));

  expect(
    classesOf(root)
      .filter((found) => found.startsWith(`${LIBRARY_CLASS_PREFIX}-`))
      .sort(),
  ).toEqual([...expectedClasses].sort());
  expect(Object.fromEntries(declarationsIn(valuesOf(root, "style")[0]))).toEqual(expectedStyle);
});

const tokens = tokenValues();
const passedThrough = ["inherit", "initial", "unset", "revert", "3px"];
const consumerDeclarations: [string, string][] = [
  ["color", "red"],
  ["margin-top", "3px"],
  ["--consumer-gap", "2px"],
];
const consumerOverride = "7px";
const elsewhere = "/elsewhere";
const ownProps = [...stylePropNames, ...visibilityPropNames, "component", ...stylesApiProps];

type Drawn = { value: string | number | null; kept: boolean };
type Declared = { written: unknown; keptKeys: string[] };

const scaleKeys = [
  ...new Set(Object.values(stylePropTable).flatMap((row) => ("scale" in row ? [row.scale] : []))),
].flatMap((scale) =>
  Object.keys(tokens)
    .filter((token) => token.startsWith(`--solix-${scale}-`))
    .map((token) => token.slice(`--solix-${scale}-`.length)),
);

const valueThatEndsADeclaration = fc
  .tuple(
    fc.constantFrom("", "1px", "red"),
    fc.constantFrom(";", "{", "}"),
    fc.constantFrom("", " color: blue", "--injected: 1", ".x{color:blue"),
  )
  .map((parts) => parts.join(""));

const drawnValue: fc.Arbitrary<Drawn> = fc.oneof(
  {
    arbitrary: fc
      .oneof(fc.constantFrom(...passedThrough, ...scaleKeys), fc.integer({ min: 0, max: 96 }))
      .map((value) => ({ value, kept: true })),
    weight: 3,
  },
  { arbitrary: fc.constant({ value: null, kept: false }), weight: 1 },
  { arbitrary: valueThatEndsADeclaration.map((value) => ({ value, kept: false })), weight: 1 },
);

const declaredStyleProp: fc.Arbitrary<Declared> = fc.oneof(
  drawnValue.map(({ value, kept }) => ({ written: value, keptKeys: kept ? [baseKey] : [] })),
  fc
    .record(Object.fromEntries(responsiveKeys.map((key) => [key, drawnValue])), {
      requiredKeys: [],
    })
    .map((byKey) => {
      const entries = Object.entries(byKey).flatMap(([key, drawn]): [string, Drawn][] =>
        drawn === undefined ? [] : [[key, drawn]],
      );
      return {
        written: Object.fromEntries(entries.map(([key, { value }]) => [key, value])),
        keptKeys: entries.flatMap(([key, { kept }]) => (kept ? [key] : [])),
      };
    }),
);

const stylePropCases = fc
  .record({
    styleProps: fc
      .uniqueArray(fc.constantFrom(...stylePropNames), { maxLength: 8 })
      .chain((names) =>
        fc.tuple(
          ...names.map((name) =>
            declaredStyleProp.map((declared): [StylePropName, Declared] => [name, declared]),
          ),
        ),
      ),
    visibility: fc.record(
      {
        hiddenFrom: fc.option(fc.constantFrom(...breakpoints), { nil: null }),
        visibleFrom: fc.option(fc.constantFrom(...breakpoints), { nil: null }),
      },
      { requiredKeys: [] },
    ),
    classTokens,
    styleWrittenAs: fc.constantFrom("object", "string", "absent"),
    unstyled: fc.boolean(),
  })
  .chain((generated) =>
    fc
      .subarray([
        ...consumerDeclarations,
        ...generated.styleProps.map(([name]): [string, string] => [
          `--${own(name)}`,
          consumerOverride,
        ]),
      ])
      .map((consumerStyle) => ({ ...generated, consumerStyle })),
  );

type StylePropCase = typeof stylePropCases extends fc.Arbitrary<infer Case> ? Case : never;

const boxCases = fc.record({
  generated: stylePropCases,
  component: fc.option(fc.constantFrom("div", "section", "article", "span", "a"), {
    nil: undefined,
  }),
});

function stylePropPropsOf(generated: StylePropCase, takesUnstyled: boolean): ConsumerProps {
  const { styleProps, visibility, styleWrittenAs, consumerStyle, unstyled } = generated;
  const style =
    styleWrittenAs === "string"
      ? consumerStyle.map(([name, value]) => `${name}: ${value}`).join("; ")
      : Object.fromEntries(consumerStyle);
  return {
    ...Object.fromEntries(styleProps.map(([name, { written: value }]) => [name, value])),
    ...visibility,
    class: classValueFrom(generated.classTokens),
    ...(styleWrittenAs === "absent" ? {} : { style }),
    ...(takesUnstyled ? { unstyled } : {}),
  };
}

function expectStylePropsOnRoot(name: string, root: Element, generated: StylePropCase): void {
  const { styleProps, visibility, classTokens: tokensOfClass, styleWrittenAs } = generated;
  const classes = classesOf(root);
  const styleText = String(valuesOf(root, "style")[0] ?? "");
  const declared = new Map(declarationsIn(valuesOf(root, "style")[0]));
  const consumerGave = styleWrittenAs === "absent" ? [] : generated.consumerStyle;
  const consumerNames = consumerGave.map(([property]) => property);
  const keptPairs = new Set(
    styleProps.flatMap(([prop, { keptKeys }]) =>
      keptKeys.map((key) => `${canonicalOf(prop)} at ${key}`),
    ),
  );
  const visibilityGiven = Object.values(visibility).filter(
    (breakpoint) => breakpoint !== null && breakpoint !== undefined,
  ).length;
  const libraryClasses = classes.filter((found) => found.startsWith(`${LIBRARY_CLASS_PREFIX}-`));
  const readByAClass = libraryClasses.filter((found) => declared.has(`--${found}`));

  expect(valuesOf(root, "class")).toHaveLength(1);
  expect(classes).toContain(`solix-${name}-root`);
  for (const { token, applied } of tokensOfClass) {
    expect(classes.includes(token), `class "${token}"`).toBe(applied);
  }
  expect(valuesOf(root, "style").length).toBeLessThanOrEqual(1);
  expect(styleText, "no value that holds a brace reaches style").not.toMatch(/[{}]/);
  expect(
    readByAClass.length,
    "one class and one custom property for each kept value of a style prop at a breakpoint, and none for null or a value that holds ;, { or }",
  ).toBe(keptPairs.size);
  expect(
    libraryClasses.length - readByAClass.length,
    "one class and no custom property for each of hiddenFrom and visibleFrom given",
  ).toBe(visibilityGiven);
  expect(
    [...declared.keys()].filter(
      (property) =>
        !consumerNames.includes(property) && !libraryClasses.includes(property.slice(2)),
    ),
    "a style prop writes only the custom property its own class reads",
  ).toEqual([]);
  expect(
    consumerGave.filter(([property, value]) => declared.get(property) !== value),
    "the consumer's style keeps every declaration it sets, a --sx- one included",
  ).toEqual([]);
  expect(
    root.attributes.filter(([attribute]) =>
      ownProps.some((ownProp) => ownProp.toLowerCase() === attribute.toLowerCase()),
    ),
    `${name}'s own props never reach the element as attributes`,
  ).toEqual([]);
}

const anchorBoxTakesHref: "href" extends keyof BoxPropsFor<"a"> ? true : false = true;
const divBoxTakesNoHref: "href" extends keyof BoxPropsFor<"div"> ? true : false = false;

test("Box takes every attribute of the element its component prop names, and only those", () => {
  const html = renderToString(() => (
    <library.Box component="a" href={elsewhere}>
      Link
    </library.Box>
  ));

  expect({ anchorBoxTakesHref, divBoxTakesNoHref }).toEqual({
    anchorBoxTakesHref: true,
    divBoxTakesNoHref: false,
  });
  expect(rootElementOf(html).tag).toBe("a");
  expect(rootElementOf(html).attributes).toContainEqual(["href", elsewhere]);
});

test("Box gives every kept style-prop value one class and the one custom property that class reads, drops null and every value that holds ;, { or }, and keeps the consumer's class and style on top", () => {
  fc.assert(
    fc.property(boxCases, ({ generated, component }) => {
      const props = {
        ...stylePropPropsOf(generated, false),
        ...(component === undefined ? {} : { component }),
        ...(component === "a" ? { href: elsewhere } : {}),
      };
      const html = rootOf.Box.render(props);
      const root = rootElementOf(html);

      expect(rootOf.Box.render(props), "a second render gives the same markup").toBe(html);
      expect(root.tag).toBe(component ?? "div");
      expectStylePropsOnRoot("Box", root, generated);
      expect(valuesOf(root, "href")).toEqual(component === "a" ? [elsewhere] : []);
    }),
    { numRuns: generatedRuns },
  );
});

test.each(builtComponents)(
  "%s takes every style prop, hiddenFrom and visibleFrom on its root, with unstyled or without, and keeps the consumer's class and style on top",
  (name) => {
    const takesUnstyled = stylesApiComponents.includes(name);
    fc.assert(
      fc.property(stylePropCases, (generated) => {
        const props = stylePropPropsOf(generated, takesUnstyled);
        const html = renderBuilt(name, props);

        expect(renderBuilt(name, props), "a second render gives the same markup").toBe(html);
        expectStylePropsOnRoot(name, rootElementOf(html), generated);
      }),
      { numRuns: generatedRuns },
    );
  },
);

const ownTypeOf = {
  disclosureClassesTakeSummary: true,
  disclosureClassesRejectAnUnknownPart: false,
  anchorButtonTakesHref: true,
  buttonTakesNoHref: false,
};

type DisclosureProps = Parameters<typeof Library.Disclosure>[0];
type ButtonPropsFor<T extends ValidComponent> = Parameters<typeof Library.Button<T>>[0];
type PartsOf<Props extends { classes?: object }> = keyof NonNullable<Props["classes"]>;

const disclosureClassesTakeSummary: "summary" extends PartsOf<DisclosureProps> ? true : false =
  true;
const disclosureClassesRejectAnUnknownPart: "label" extends PartsOf<DisclosureProps>
  ? true
  : false = false;
const anchorButtonTakesHref: "href" extends keyof ButtonPropsFor<"a"> ? true : false = true;
const buttonTakesNoHref: "href" extends keyof ButtonPropsFor<"button"> ? true : false = false;

test("a component's classes and styles take the keys of its stylex.create block, and Button takes the attributes of the element its component prop names", () => {
  const html = renderToString(() => (
    <library.Button component="a" href={elsewhere}>
      Link
    </library.Button>
  ));

  expect({
    disclosureClassesTakeSummary,
    disclosureClassesRejectAnUnknownPart,
    anchorButtonTakesHref,
    buttonTakesNoHref,
  }).toEqual(ownTypeOf);
  expect(rootElementOf(html).tag).toBe("a");
  expect(rootElementOf(html).attributes).toContainEqual(["href", elsewhere]);
  expect(classesOf(rootElementOf(html))).toContain("solix-Button-root");
});

test("the contract skill names each component's root tag and boolean attribute as rootOf does", () => {
  const rows = readFileSync(join(repositoryRoot, contractSkill), "utf8")
    .split("\n")
    .filter((line) => line.startsWith("|"));
  const violations = Object.entries(rootOf).flatMap(([name, { tag, booleanAttribute }]) => {
    const file = `packages/core/src/${name}.tsx`;
    const row = rows.find((line) => line.includes(`\`${file}\``));
    if (!row) return [`${contractSkill}: add a covered-code row for \`${file}\`.`];
    return [`<${tag}>`, `\`${booleanAttribute}\``]
      .filter((fact) => !row.includes(fact))
      .map((fact) => `${contractSkill}: say ${fact} in the row for \`${file}\`, as rootOf does.`);
  });

  expect(violations).toEqual([]);
});
