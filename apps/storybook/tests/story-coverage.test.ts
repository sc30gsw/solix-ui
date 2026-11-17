import { join } from "node:path";
import type { StoryIndexEntry } from "storybook/internal/types";
import { beforeAll, expect, test } from "vite-plus/test";
import { repositoryRoot } from "../../../scripts/repository.ts";
import { componentExports, library } from "../../../packages/core/tests/built-library.ts";
import { storyFileOf, storyIndex } from "#/tests/support/stories.ts";

type StoryModule = { default?: { component?: unknown } };

const builtByName: Record<string, unknown> = library;
const indexTimeout = 60_000;
let stories: StoryIndexEntry[] = [];

beforeAll(async () => {
  stories = await storyIndex();
}, indexTimeout);

test("every component the built library exports is the component of a story Storybook indexes, and every file of such a story names a component", async () => {
  const components = componentExports();
  const files = [...new Set(stories.map(storyFileOf))];
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
