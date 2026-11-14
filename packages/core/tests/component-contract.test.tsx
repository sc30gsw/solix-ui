import { readFileSync } from "node:fs";
import { join } from "node:path";
import { type ComponentProps, type JSX, renderToString, type ValidComponent } from "@solidjs/web";
import fc from "fast-check";
import { expect, test } from "vite-plus/test";
import { tokenValues } from "../../../scripts/tokens.mjs";
import { LIBRARY_CLASS_PREFIX } from "../build-pipeline.mjs";
import type * as Library from "../src/index";
import {
  breakpoints,
  type StylePropName,
  stylePropNames,
  stylePropTable,
  visibilityPropNames,
} from "../src/style-props";

type ConsumerProps = Record<string, unknown>;

const builtLibrary = join(import.meta.dirname, "../dist/index.js");
const library = (await import(builtLibrary)) as typeof Library;
const generatedRuns = 300;
const repositoryRoot = join(import.meta.dirname, "../../..");
const contractSkill = ".agents/skills/verify-component-contract/SKILL.md";

const rootOf: {
  [Name in keyof typeof Library]: {
    tag: string;
    booleanAttribute: string;
    hasDefaultStyles: boolean;
    render: (props: ConsumerProps) => string;
  };
} = {
  Box: {
    tag: "div",
    booleanAttribute: "hidden",
    hasDefaultStyles: false,
    render: (props) => renderToString(() => <library.Box {...props}>Content</library.Box>),
  },
  Button: {
    tag: "button",
    booleanAttribute: "disabled",
    hasDefaultStyles: true,
    render: (props) =>
      renderToString(() => (
        <library.Button {...(props as ComponentProps<"button">)}>Label</library.Button>
      )),
  },
  Disclosure: {
    tag: "details",
    booleanAttribute: "open",
    hasDefaultStyles: true,
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
    hasDefaultStyles: true,
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
    hasDefaultStyles: true,
    render: (props) =>
      renderToString(() => <library.TextInput {...(props as ComponentProps<"input">)} />),
  },
};

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

test("every component the library exports is held to the root contract", () => {
  const exportedComponents = Object.entries(library)
    .filter(([, exported]) => typeof exported === "function")
    .map(([name]) => name);

  expect(exportedComponents.sort()).toEqual(Object.keys(rootOf).sort());
});

test.each(Object.entries(rootOf))(
  "%s puts every class and attribute a consumer passes on its root, next to its own classes",
  (name, component) => {
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
        expect(classes.some((found) => found.startsWith(LIBRARY_CLASS_PREFIX))).toBe(
          component.hasDefaultStyles,
        );
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

const tokens = tokenValues();
const pixelsPerRem = 16;
const baseKey = "base";
const passedThrough = ["inherit", "initial", "unset", "revert", "3px"];
const consumerDeclarations: [string, string][] = [
  ["color", "red"],
  ["margin-top", "3px"],
  ["--consumer-gap", "2px"],
];
const consumerOverride = "7px";
const elsewhere = "/elsewhere";
const ownPropsOfBox = [...stylePropNames, ...visibilityPropNames, "component"];

type Written = { value: string | number; css: string };
type Declared = { written: unknown; declared: [suffix: string, css: string][] };
type BoxPropsFor<T extends ValidComponent> = Parameters<typeof Library.Box<T>>[0];

function scaleOf(name: StylePropName): string | undefined {
  const row = stylePropTable[name];
  return "scale" in row ? row.scale : undefined;
}

const scaleKeys = [...new Set(stylePropNames.flatMap((name) => scaleOf(name) ?? []))].flatMap(
  (scale) =>
    Object.keys(tokens)
      .filter((token) => token.startsWith(`--solix-${scale}-`))
      .map((token) => token.slice(`--solix-${scale}-`.length)),
);

function cssFor(name: StylePropName, value: string | number): string {
  const scale = scaleOf(name);
  const token = `--solix-${scale}-${value}`;
  if (scale !== undefined && typeof value === "string" && token in tokens) return `var(${token})`;
  if (stylePropTable[name].kind === "length" && typeof value === "number") {
    return `${value / pixelsPerRem}rem`;
  }
  return String(value);
}

function written(name: StylePropName): fc.Arbitrary<Written> {
  return fc
    .oneof(fc.constantFrom(...passedThrough, ...scaleKeys), fc.integer({ min: 0, max: 96 }))
    .map((value) => ({ value, css: cssFor(name, value) }));
}

function suffixFor(name: string, key: string): string {
  return key === baseKey ? name : `${name}-${key}`;
}

function declaredStyleProp(name: StylePropName): fc.Arbitrary<Declared> {
  const responsiveKeys = [baseKey, ...breakpoints];
  const single = written(name).map(({ value, css }): Declared => ({
    written: value,
    declared: [[name, css]],
  }));
  const responsive = fc
    .record(Object.fromEntries(responsiveKeys.map((key) => [key, written(name)])), {
      requiredKeys: [],
    })
    .map((byKey): Declared => ({
      written: Object.fromEntries(
        Object.entries(byKey).flatMap(([key, entry]) =>
          entry === undefined ? [] : [[key, entry.value]],
        ),
      ),
      declared: responsiveKeys.flatMap((key): [string, string][] => {
        const value = byKey[key];
        return value === undefined ? [] : [[suffixFor(name, key), value.css]];
      }),
    }));
  return fc.oneof(single, responsive);
}

const boxCases = fc
  .record({
    styleProps: fc
      .uniqueArray(fc.constantFrom(...stylePropNames), { maxLength: 8 })
      .chain((names) =>
        fc.tuple(
          ...names.map((name) =>
            declaredStyleProp(name).map((declared): [StylePropName, Declared] => [name, declared]),
          ),
        ),
      ),
    visibility: fc.record(
      { hiddenFrom: fc.constantFrom(...breakpoints), visibleFrom: fc.constantFrom(...breakpoints) },
      { requiredKeys: [] },
    ),
    component: fc.option(fc.constantFrom("div", "section", "article", "span", "a"), {
      nil: undefined,
    }),
    classTokens,
    styleWrittenAs: fc.constantFrom("object", "string", "absent"),
  })
  .chain((generated) => {
    const ownProperties = generated.styleProps.flatMap(([, { declared }]) =>
      declared.map(([suffix]): [string, string] => [
        `--${LIBRARY_CLASS_PREFIX}-${suffix}`,
        consumerOverride,
      ]),
    );
    return fc
      .subarray([...consumerDeclarations, ...ownProperties])
      .map((consumerStyle) => ({ ...generated, consumerStyle }));
  });

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

test("Box turns every generated style prop into sx- classes and --sx- custom properties, and keeps the consumer's class and style on top", () => {
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
        const declarations = declarationsIn(valuesOf("style")[0]);
        const consumerNames = (styleWrittenAs === "absent" ? [] : consumerStyle).map(
          ([name]) => name,
        );
        const expectedClasses = [
          ...styleProps.flatMap(([, { declared }]) =>
            declared.map(([suffix]) => `${LIBRARY_CLASS_PREFIX}-${suffix}`),
          ),
          ...(visibility.hiddenFrom
            ? [`${LIBRARY_CLASS_PREFIX}-hidden-from-${visibility.hiddenFrom}`]
            : []),
          ...(visibility.visibleFrom
            ? [`${LIBRARY_CLASS_PREFIX}-visible-from-${visibility.visibleFrom}`]
            : []),
        ];
        const expectedStyle = Object.fromEntries([
          ...styleProps.flatMap(([, { declared }]) =>
            declared.map(([suffix, css]) => [`--${LIBRARY_CLASS_PREFIX}-${suffix}`, css]),
          ),
          ...(styleWrittenAs === "absent" ? [] : consumerStyle),
        ]);

        expect(rootOf.Box.render(props), "a second render gives the same markup").toBe(html);
        expect(root.tag).toBe(component ?? "div");
        expect(valuesOf("class")).toHaveLength(1);
        expect(classes).toContain("solix-Box-root");
        expect(
          classes.filter((found) => found.startsWith(LIBRARY_CLASS_PREFIX)).sort(),
          "the sx- classes are exactly those of the style props given",
        ).toEqual(expectedClasses.sort());
        for (const { token, applied } of tokensOfClass) {
          expect(classes.includes(token), `class "${token}"`).toBe(applied);
        }
        expect(valuesOf("style").length).toBeLessThanOrEqual(1);
        expect(
          declarations.filter(
            ([name]) =>
              !consumerNames.includes(name) && !name.startsWith(`--${LIBRARY_CLASS_PREFIX}-`),
          ),
          "a style prop writes only --sx- custom properties",
        ).toEqual([]);
        expect(
          Object.fromEntries(declarations),
          "each --sx- property holds its style prop's value unless the consumer's style sets it",
        ).toEqual(expectedStyle);
        expect(
          root.attributes.filter(([name]) =>
            ownPropsOfBox.some((own) => own.toLowerCase() === name.toLowerCase()),
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
