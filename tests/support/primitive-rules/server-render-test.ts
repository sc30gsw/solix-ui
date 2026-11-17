import { join, relative } from "node:path";
import { repositoryRoot } from "#/tests/support/workspace.ts";
import { type PrimitiveRule, type Rule } from "#/tests/support/primitive-rules/library.ts";

const serverRenderTest = "server-render.test.ts";

const serverRenderTestExists: Rule = (library) => {
  const path = join(library.testDirectory, serverRenderTest);
  return library.tests.has(serverRenderTest)
    ? []
    : [
        `${relative(repositoryRoot, path)}: add the server-render test, with a case for every primitive the barrel exports.`,
      ];
};

export const serverRenderTestRule: PrimitiveRule = {
  description: "the primitives package has a server-render test",
  rule: serverRenderTestExists,
};
