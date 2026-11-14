import { readFileSync } from "node:fs";
import { join } from "node:path";
import { type ComponentProps, type JSX, renderToString, type ValidComponent } from "@solidjs/web";
import fc from "fast-check";
import postcss from "postcss";
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

type ConsumerProps = Record<string, unknown>;

const dist = join(import.meta.dirname, "../dist");
const library = (await import(join(dist, "index.js"))) as typeof Library;
const generatedRuns = 300;
const repositoryRoot = join(import.meta.dirname, "../../..");
const contractSkill = ".agents/skills/verify-component-contract/SKILL.md";

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
    render: (props) => renderToString(() => <library.Box {...props}>Content</library.Box>),
  },
  Button: {
    tag: "button",
    booleanAttribute: "disabled",
    render: (props) =>
      renderToString(() => (
        <library.Button {...(props as ComponentProps<"button">)}>Label</library.Button>
      )),
  },
  Disclosure: {
    tag: "details",
    booleanAttribute: "open",
    render: (props) =>
      renderToString(() => (
        <library.Disclosure label="Label" {...(props as ComponentProps<"details">)}>
          Content
        </library.Disclosure>
      )),
  },
  Modal: {
    tag: "dialog",
    booleanAttribute: "hidden",
    render: (props) =>
      renderToString(() => (
        <library.Modal label="Label" opened={false} {...(props as ComponentProps<"dialog">)}>
          Content
        </library.Modal>
      )),
  },
  TextInput: {
    tag: "input",
    booleanAttribute: "disabled",
    render: (props) =>
      renderToString(() => <library.TextInput {...(props as ComponentProps<"input">)} />),
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

const classTokens = fc.uniqueArray(
  fc.record({
    token: consumerToken,
    applied: fc.boolean(),
    writtenAs: fc.constantFrom("string", "array item", "object key"),
  }),
  { maxLength: 6, selector: ({ token }) => token },
);

type ClassToken = { token: string; applied: boolean; writtenAs: string };

function classValueFrom(tokens: ClassToken[]): JSX.ClassValue {
  const written = (shape: string) => tokens.filter(({ writtenAs }) => writtenAs === shape);
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

function rootElementOf(html: string): { tag: string; attributes: [string, string | true][] } {
  const root = /^<([a-z]+)((?:\s+[^\s=>]+(?:=(?:"[^"]*"|[^\s">]+))?)*)>/.exec(html);
  if (!root) throw new Error(`The rendered markup does not start with an element: ${html}`);
  const attributes = [...root[2].matchAll(/\s+([^\s=>]+)(?:=(?:"([^"]*)"|([^\s">]+)))?/g)].map(
    ([, name, quoted, bare]): [string, string | true] => [name, quoted ?? bare ?? true],
  );
  return { tag: root[1], attributes };
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

test("every component the library exports is held to the root contract", () => {
  const exportedComponents = Object.entries(library)
    .filter(([, exported]) => typeof exported === "function")
    .map(([name]) => name);

  expect(exportedComponents.sort()).toEqual(Object.keys(rootOf).sort());
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
        const valuesOf = (attribute: string) =>
          root.attributes.filter(([found]) => found === attribute).map(([, value]) => value);
        const classes = String(valuesOf("class")[0]).split(/\s+/);

        expect(root.tag).toBe(component.tag);
        expect(valuesOf("class")).toHaveLength(1);
        expect(classes).toContain(`solix-${name}-root`);
        expect(
          classes.some((found) => found.startsWith(LIBRARY_CLASS_PREFIX)),
          `the built ${name} ${hasDefaultStyles ? "emits" : "emits no"} StyleX class, so its root carries ${hasDefaultStyles ? "one" : "none"} of the library's style classes`,
        ).toBe(hasDefaultStyles);
        for (const { token, applied } of tokens) {
          expect(classes.includes(token), `class "${token}"`).toBe(applied);
        }
        for (const [attribute, value] of Object.entries(attributes)) {
          expect(valuesOf(attribute), attribute).toEqual([value]);
        }
        expect(valuesOf(component.booleanAttribute)).toEqual(flag ? [true] : []);
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
  const valuesOf = (attribute: string) =>
    root.attributes.filter(([found]) => found === attribute).map(([, value]) => value);
  const classes = String(valuesOf("class")[0]).split(/\s+/);

  expect(classes.filter((found) => found.startsWith(`${LIBRARY_CLASS_PREFIX}-`)).sort()).toEqual(
    [...expectedClasses].sort(),
  );
  expect(Object.fromEntries(declarationsIn(valuesOf("style")[0]))).toEqual(expectedStyle);
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
const ownPropsOfBox = [...stylePropNames, ...visibilityPropNames, "component"];

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

const boxCases = fc
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
    component: fc.option(fc.constantFrom("div", "section", "article", "span", "a"), {
      nil: undefined,
    }),
    classTokens,
    styleWrittenAs: fc.constantFrom("object", "string", "absent"),
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
    fc.property(
      boxCases,
      ({
        styleProps,
        visibility,
        component,
        classTokens: tokensOfClass,
        styleWrittenAs,
        consumerStyle,
      }) => {
        const style =
          styleWrittenAs === "string"
            ? consumerStyle.map(([name, value]) => `${name}: ${value}`).join("; ")
            : Object.fromEntries(consumerStyle);
        const props = {
          ...Object.fromEntries(styleProps.map(([name, { written: value }]) => [name, value])),
          ...visibility,
          ...(component === undefined ? {} : { component }),
          ...(component === "a" ? { href: elsewhere } : {}),
          class: classValueFrom(tokensOfClass),
          ...(styleWrittenAs === "absent" ? {} : { style }),
        };
        const html = rootOf.Box.render(props);
        const root = rootElementOf(html);
        const valuesOf = (attribute: string) =>
          root.attributes.filter(([found]) => found === attribute).map(([, value]) => value);
        const classes = String(valuesOf("class")[0]).split(/\s+/);
        const styleText = String(valuesOf("style")[0] ?? "");
        const declared = new Map(declarationsIn(valuesOf("style")[0]));
        const consumerGave = styleWrittenAs === "absent" ? [] : consumerStyle;
        const consumerNames = consumerGave.map(([name]) => name);
        const keptPairs = new Set(
          styleProps.flatMap(([name, { keptKeys }]) =>
            keptKeys.map((key) => `${canonicalOf(name)} at ${key}`),
          ),
        );
        const visibilityGiven = Object.values(visibility).filter(
          (breakpoint) => breakpoint !== null && breakpoint !== undefined,
        ).length;
        const libraryClasses = classes.filter((found) =>
          found.startsWith(`${LIBRARY_CLASS_PREFIX}-`),
        );
        const readByAClass = libraryClasses.filter((found) => declared.has(`--${found}`));

        expect(rootOf.Box.render(props), "a second render gives the same markup").toBe(html);
        expect(root.tag).toBe(component ?? "div");
        expect(valuesOf("class")).toHaveLength(1);
        expect(classes).toContain("solix-Box-root");
        for (const { token, applied } of tokensOfClass) {
          expect(classes.includes(token), `class "${token}"`).toBe(applied);
        }
        expect(valuesOf("style").length).toBeLessThanOrEqual(1);
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
            (name) => !consumerNames.includes(name) && !libraryClasses.includes(name.slice(2)),
          ),
          "a style prop writes only the custom property its own class reads",
        ).toEqual([]);
        expect(
          consumerGave.filter(([name, value]) => declared.get(name) !== value),
          "the consumer's style keeps every declaration it sets, a --sx- one included",
        ).toEqual([]);
        expect(
          root.attributes.filter(([name]) =>
            ownPropsOfBox.some((ownProp) => ownProp.toLowerCase() === name.toLowerCase()),
          ),
          "Box's own props never reach the element as attributes",
        ).toEqual([]);
        expect(valuesOf("href")).toEqual(component === "a" ? [elsewhere] : []);
      },
    ),
    { numRuns: generatedRuns },
  );
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
