import { join } from "node:path";
import { subpathSpecifierOf } from "#/scripts/subpath-imports.ts";
import { importsOf } from "#/scripts/syntax.ts";
import {
  browserTests,
  type PrimitiveRule,
  type Rule,
  solidModule,
  testAt,
} from "#/tests/support/primitive-rules/library.ts";

const browserHarnessFile = "support/browser-harness.ts";

const flushName = "flush";

const browserTestsUseTheHarness: Rule = (library) =>
  browserTests(library).flatMap(([file, source]) => {
    const browserHarness = subpathSpecifierOf(
      join(library.testDirectory, file),
      join(library.testDirectory, browserHarnessFile),
    );
    const imports = importsOf(source);
    const harness = imports.some(({ specifier }) => specifier === browserHarness)
      ? []
      : [
          `${testAt(library, file, source)}: import ${browserHarness}, so this file's tests fail on a Solid diagnostic and on a listener, timer or observer left after dispose.`,
        ];
    const flushFromSolid = imports
      .filter(({ specifier }) => specifier === solidModule)
      .flatMap(({ names }) => names)
      .filter(({ imported }) => imported === flushName)
      .map(
        ({ node }) =>
          `${testAt(library, file, source, node)}: take ${flushName} from ${browserHarness}, not from ${solidModule}, so what a flush runs is attributed to the primitive.`,
      );
    return [...harness, ...flushFromSolid];
  });

export const browserTestsUseTheHarnessRule: PrimitiveRule = {
  description: "every browser test imports the harness and flushes through it",
  rule: browserTestsUseTheHarness,
};
