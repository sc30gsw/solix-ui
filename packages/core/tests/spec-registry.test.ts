import { expect, test } from "vite-plus/test";
import { describeLook, type FunctionSpec } from "#/spec/format.ts";
import { parityGapItems } from "#/spec/gaps.ts";
import { functionSpecs, lookSpecs, type Registered, registry } from "#/spec/registry.ts";
import { componentExports } from "#/tests/built-library.ts";

const slots: readonly Registered[] = Object.values(registry);

test("the registry names the shared foundations and exactly the components the built library exports", () => {
  expect(Object.keys(registry).sort()).toEqual(["foundations", ...componentExports()].sort());
});

test("every parity-gap item is one that an entry or a slot of the registry waits on", () => {
  const waited = new Set<string>(
    [
      ...functionSpecs.flatMap(([, spec]) => spec.entries.map(({ status }) => status)),
      ...lookSpecs.flatMap(([, spec]) => spec.map(({ status }) => status)),
    ].flatMap((status) => (status === "holds" ? [] : [status.until])),
  );
  for (const registered of slots) {
    for (const slot of [registered.function, registered.look]) {
      if (typeof slot !== "object") continue;
      for (const item of [slot.writtenBy, slot.completedBy]) {
        if (item !== undefined) waited.add(item);
      }
    }
  }

  expect(Object.keys(parityGapItems).filter((item) => !waited.has(item))).toEqual([]);
});

function uncovered(name: string, spec: FunctionSpec): string[] {
  const { props, parts, variables, exports } = spec.reference;
  const named = new Set(
    spec.entries.flatMap(({ about }) =>
      about === "every part" ? parts.map((part) => `part ${part}`) : [about],
    ),
  );
  return [
    ...props.map((prop) => `prop ${prop}`),
    ...parts.map((part) => `part ${part}`),
    ...variables.map((variable) => `variable ${variable}`),
    ...exports.map((name) => `export ${name}`),
  ]
    .filter((listed) => !named.has(listed))
    .map((listed) => `${name}: no entry promises its ${listed}.`);
}

test("every prop, part, variable and export a written function spec lists has an entry that promises it", () => {
  expect(functionSpecs.flatMap(([name, spec]) => uncovered(name, spec))).toEqual([]);
});

function repeated(section: string, names: readonly string[]): string[] {
  return names
    .filter((name, at) => names.indexOf(name) !== at)
    .map((name) => `${section}: two entries are named "${name}".`);
}

test("no two entries of a document share a test name", () => {
  expect([
    ...functionSpecs.flatMap(([section, spec]) =>
      repeated(
        `function ${section}`,
        spec.entries.map(({ says }) => says),
      ),
    ),
    ...lookSpecs.flatMap(([section, spec]) => repeated(`look ${section}`, spec.map(describeLook))),
  ]).toEqual([]);
});
