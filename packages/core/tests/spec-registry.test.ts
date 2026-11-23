import { readdirSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vite-plus/test";
import { isSpec, type LookSpec, type Spec } from "#/spec/format.ts";
import { parityGapItems } from "#/spec/gaps.ts";
import { foundations, functionSpecs, lookSpecs, type Registered, specs } from "#/spec/registry.ts";
import { componentExports } from "#/tests/built-library.ts";

const specDirectory = join(import.meta.dirname, "../spec");
const browserOnlyModules = new Set(["runner.ts", "commands.ts"]);
const registered: readonly (Spec | LookSpec)[] = [
  ...functionSpecs.map(([, spec]) => spec),
  ...lookSpecs.map(([, spec]) => spec),
];

function specModules(): string[] {
  return readdirSync(specDirectory, { recursive: true, encoding: "utf8" })
    .filter((file) => file.endsWith(".ts") && !browserOnlyModules.has(file))
    .sort();
}

test("the registry names exactly the components the built library exports", () => {
  expect(Object.keys(specs).sort()).toEqual([...componentExports()].sort());
});

test("every spec a module under packages/core/spec exports is one the registry holds", async () => {
  const strays = (
    await Promise.all(
      specModules().map(async (file) => {
        const module: Record<string, unknown> = await import(join(specDirectory, file));
        return Object.entries(module)
          .filter(([, value]) => isSpec(value) && !registered.includes(value))
          .map(
            ([name]) => `packages/core/spec/${file}: ${name} is a spec the registry leaves out.`,
          );
      }),
    )
  ).flat();

  expect(specModules().length).toBeGreaterThan(0);
  expect(strays).toEqual([]);
});

test("every parity-gap item is one that an entry or the registry waits on", () => {
  const waited = new Set<string>([
    ...registered.flatMap(({ entries }) =>
      entries.flatMap((entry) => (entry.status === "pending" ? [entry.until] : [])),
    ),
    ...Object.values(specs).flatMap((entry: Registered) =>
      "coveredBy" in entry
        ? []
        : [entry.spec, entry.look, entry.until].filter((item) => typeof item === "string"),
    ),
  ]);
  const idle = Object.keys(parityGapItems).filter((item) => !waited.has(item));

  expect(idle).toEqual([]);
});

function uncovered(name: string, spec: Spec): string[] {
  const { props, parts, variables } = spec.reference;
  const named = new Set(
    spec.entries.flatMap(({ promise }) => {
      if (promise.kind === "prop" || promise.kind === "default") return [`prop ${promise.prop}`];
      if (promise.kind === "part") return [`part ${promise.part}`];
      if (promise.kind === "parts") return parts.map((part) => `part ${part}`);
      if (promise.kind === "variable") return [`variable ${promise.variable}`];
      return [];
    }),
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
  const complete: [string, Spec][] = [
    ["foundations", foundations.spec],
    ...Object.entries(specs).flatMap(([name, entry]: [string, Registered]): [string, Spec][] =>
      "spec" in entry && typeof entry.spec !== "string" && entry.until === undefined
        ? [[name, entry.spec]]
        : [],
    ),
  ];

  expect(complete.length).toBeGreaterThan(1);
  expect(complete.flatMap(([name, spec]) => uncovered(name, spec))).toEqual([]);
});
