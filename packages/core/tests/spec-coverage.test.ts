import { readdirSync } from "node:fs";
import { basename, join } from "node:path";
import { expect, test } from "vite-plus/test";
import type { Spec } from "#/spec/format.ts";
import { looksNotYetWritten, specsNotYetWritten } from "#/spec/not-yet-written.ts";
import { functionSpecs, lookSpecs } from "#/spec/specs.ts";
import { componentExports } from "#/tests/built-library.ts";

type Kind = {
  readonly what: string;
  readonly directory: string;
  readonly listName: string;
  readonly list: Readonly<Record<string, string | undefined>>;
  readonly run: readonly Spec[];
};

const specDirectory = join(import.meta.dirname, "../spec");
const componentFile = /^[A-Z][A-Za-z0-9]*\.ts$/;

const kinds: readonly Kind[] = [
  {
    what: "spec",
    directory: specDirectory,
    listName: "specsNotYetWritten",
    list: specsNotYetWritten,
    run: functionSpecs,
  },
  {
    what: "look spec",
    directory: join(specDirectory, "look"),
    listName: "looksNotYetWritten",
    list: looksNotYetWritten,
    run: lookSpecs,
  },
];

function written(directory: string): string[] {
  return readdirSync(directory)
    .filter((file) => componentFile.test(file))
    .map((file) => basename(file, ".ts"));
}

function problemsOf({ what, directory, listName, list, run }: Kind): string[] {
  const components = componentExports();
  const files = written(directory);
  const where = "packages/core/spec/not-yet-written.ts";
  const relative = directory.slice(directory.indexOf("packages/core/spec"));
  return [
    ...components
      .filter((name) => !files.includes(name) && list[name] === undefined)
      .map(
        (name) =>
          `${name}: write its ${what} as ${relative}/${name}.ts, or list it in ${listName} in ${where} with the parity-gap step that will write it.`,
      ),
    ...Object.keys(list)
      .filter((name) => files.includes(name))
      .map(
        (name) =>
          `${name}: ${relative}/${name}.ts is written, so ${listName} in ${where} is stale. Remove ${name} from it.`,
      ),
    ...Object.keys(list)
      .filter((name) => !components.includes(name))
      .map(
        (name) =>
          `${name}: the built library exports no such component, so ${listName} in ${where} is stale. Remove ${name} from it.`,
      ),
    ...files
      .filter((name) => !components.includes(name))
      .map(
        (name) => `${relative}/${name}.ts: the built library exports no component named ${name}.`,
      ),
    ...files
      .filter((name) => !run.some((spec) => spec.name === name))
      .map(
        (name) =>
          `${relative}/${name}.ts: no runner reads it. Add its spec to packages/core/spec/specs.ts.`,
      ),
  ];
}

test.each(kinds)(
  "every component the library exports has a $what file, or is listed as not yet written with the step that will write it, and the list is not stale",
  (kind) => {
    expect(componentExports().length).toBeGreaterThan(0);
    expect(problemsOf(kind)).toEqual([]);
  },
);
