import { expect, test } from "vite-plus/test";
import type { FunctionSpec, FunctionStatus, LookStatus } from "#/spec/format.ts";
import { parityGapItems } from "#/spec/gaps.ts";
import { foundations, functionSpecs, lookSpecs, type Registered, specs } from "#/spec/registry.ts";
import { componentExports } from "#/tests/built-library.ts";

const statuses: readonly (FunctionStatus | LookStatus)[] = [
  ...functionSpecs.flatMap(([, spec]) => spec.entries.map(({ status }) => status)),
  ...lookSpecs.flatMap(([, spec]) => spec.map(({ status }) => status)),
];

test("the registry names exactly the components the built library exports", () => {
  expect(Object.keys(specs).sort()).toEqual([...componentExports()].sort());
});

test("every parity-gap item is one that an entry or the registry waits on", () => {
  const waited = new Set<string>([
    ...statuses.flatMap((status) => (status === "holds" ? [] : [status.until])),
    ...Object.values(specs).flatMap((entry: Registered) =>
      "coveredBy" in entry
        ? []
        : [entry.spec, entry.look, entry.until].filter((item) => typeof item === "string"),
    ),
  ]);
  const idle = Object.keys(parityGapItems).filter((item) => !waited.has(item));

  expect(idle).toEqual([]);
});

function uncovered(name: string, spec: FunctionSpec): string[] {
  const { props, parts, variables } = spec.reference;
  const named = new Set(
    spec.entries.flatMap(({ about }) =>
      about === "every part" ? parts.map((part) => `part ${part}`) : [about],
    ),
  );
  return [
    ...props.map((prop) => `prop ${prop}`),
    ...parts.map((part) => `part ${part}`),
    ...variables.map((variable) => `variable ${variable}`),
  ]
    .filter((listed) => !named.has(listed))
    .map((listed) => `${name}: no entry promises its ${listed}.`);
}

test("every prop, part and variable a complete spec lists has an entry that promises it", () => {
  const complete: [string, FunctionSpec][] = [
    ["foundations", foundations.spec],
    ...Object.entries(specs).flatMap(
      ([name, entry]: [string, Registered]): [string, FunctionSpec][] =>
        "spec" in entry && typeof entry.spec !== "string" && entry.until === undefined
          ? [[name, entry.spec]]
          : [],
    ),
  ];

  expect(complete.length).toBeGreaterThan(1);
  expect(complete.flatMap(([name, spec]) => uncovered(name, spec))).toEqual([]);
});
