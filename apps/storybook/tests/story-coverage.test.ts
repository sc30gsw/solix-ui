import { join } from "node:path";
import type { StoryIndexEntry } from "storybook/internal/types";
import { beforeAll, expect, inject, test } from "vite-plus/test";
import { enginesToVerify } from "../../../scripts/browser-engines.mjs";
import { repositoryRoot } from "../../../scripts/repository.ts";
import { componentExports, library } from "../../../packages/core/tests/built-library.ts";
import { storiesTestedInEveryEngine, storyFileOf, storyIndex } from "#/tests/support/stories.ts";

type StoryModule = { default?: { component?: unknown } };

const builtByName: Record<string, unknown> = library;
const indexTimeout = 60_000;
let tested: StoryIndexEntry[] = [];

beforeAll(async () => {
  tested = storiesTestedInEveryEngine(
    await storyIndex(),
    inject("testFilesOfEachProject"),
    enginesToVerify(),
  );
}, indexTimeout);

test("every component the built library exports is the component of a story that runs as a test in every engine, and every file of such a story names a component", async () => {
  const components = componentExports();
  const files = [...new Set(tested.map(storyFileOf))];
  const storied = await Promise.all(
    files.map(async (file) => ({
      file,
      component: ((await import(join(repositoryRoot, file))) as StoryModule).default?.component,
    })),
  );
  const unstoried = components
    .filter((name) => !storied.some(({ component }) => component === builtByName[name]))
    .map(
      (name) =>
        `${name}: add a story file to apps/storybook/src whose default export names ${name}, or the static member that holds it, such as Grid.Col, as its component.`,
    );
  const strays = storied
    .filter(({ component }) => !components.some((name) => builtByName[name] === component))
    .map(
      ({ file }) =>
        `${file}: its default export names no component of the built library as its component.`,
    );

  expect(components.length).toBeGreaterThan(0);
  expect([...unstoried, ...strays]).toEqual([]);
});
