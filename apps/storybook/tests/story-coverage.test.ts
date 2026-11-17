import { relative } from "node:path";
import { expect, test } from "vite-plus/test";
import { library } from "../../../packages/core/tests/built-library.ts";
import { exportsThatRender, storyFiles, storybookDirectory } from "#/tests/support/stories.ts";

type StoryModule = { default?: { component?: unknown } };

const builtByName: Record<string, unknown> = library;

test("every component the built library exports, a part it carries and the provider among them, is the component of a story file", async () => {
  const components = exportsThatRender();
  const storied = await Promise.all(
    storyFiles.map(async (file) => ({
      file: relative(storybookDirectory, file),
      component: ((await import(file)) as StoryModule).default?.component,
    })),
  );
  const unstoried = components
    .filter((name) => !storied.some(({ component }) => component === builtByName[name]))
    .map(
      (name) =>
        `${name}: add src/${name}.stories.tsx to apps/storybook, whose default export names ${name}, or the part's carrier member, as its component.`,
    );
  const strays = storied
    .filter(({ component }) => !components.some((name) => builtByName[name] === component))
    .map(
      ({ file }) =>
        `apps/storybook/${file}: its default export names no component of the built library as its component.`,
    );

  expect(components.length).toBeGreaterThan(0);
  expect(Object.keys(builtByName)).toEqual(expect.arrayContaining(components));
  expect([...unstoried, ...strays]).toEqual([]);
});
