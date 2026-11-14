import { readFileSync } from "node:fs";
import { join } from "node:path";
import { type ComponentProps, renderToString } from "@solidjs/web";
import fc from "fast-check";
import { expect, test } from "vite-plus/test";
import { LIBRARY_CLASS_PREFIX } from "../build-pipeline.mjs";
import type * as Library from "../src/index";

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
    render: (props: ConsumerProps) => string;
  };
} = {
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

function classValueFrom(tokens: ClassToken[]): unknown {
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
  const root = /^<([a-z]+)((?:\s+[^\s=>]+(?:="[^"]*")?)*)>/.exec(html);
  if (!root) throw new Error(`The rendered markup does not start with an element: ${html}`);
  const attributes = [...root[2].matchAll(/\s+([^\s=>]+)(?:="([^"]*)")?/g)].map(
    ([, name, value]): [string, string | true] => [name, value ?? true],
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
        expect(classes.some((found) => found.startsWith(LIBRARY_CLASS_PREFIX))).toBe(true);
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
