import { join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { getCoreAnnotations } from "storybook/internal/csf";
import { composeConfigs, composeStory } from "storybook/preview-api";
import { beforeAll, expect, test } from "vite-plus/test";
import { libraryComponentProps } from "../../../scripts/component-props.ts";
import { repositoryRoot } from "../../../scripts/repository.ts";
import { argTypesOfEachComponent } from "../../../scripts/story-controls.ts";
import { library } from "../../../packages/core/tests/built-library.ts";
import { indexedStoryFiles } from "#/tests/support/stories.ts";

type Annotations = {
  component?: unknown;
  args?: object;
  argTypes?: object;
  parameters?: object;
};
type StoryModule = { readonly default: Annotations } & Readonly<
  Record<string, Annotations | undefined>
>;
type IndexedFile = { file: string; stories: string[]; module: StoryModule };

const builtByName: Record<string, unknown> = library;
const indexTimeout = 60_000;
const keysThatChangeControls = new Set(["argTypes", "parameters"]);
let indexed: IndexedFile[] = [];

function notRendered(): never {
  throw new Error("This test composes the stories for their args and renders none.");
}

const withTheCoreAnnotations = composeConfigs([...getCoreAnnotations(), { render: notRendered }]);

beforeAll(async () => {
  indexed = await Promise.all(
    (await indexedStoryFiles()).map(async ({ file, stories }) => ({
      file,
      stories: [...stories],
      module: (await import(join(repositoryRoot, file))) as StoryModule,
    })),
  );
}, indexTimeout);

function composed(module: StoryModule, story: string, meta: Annotations = module.default) {
  return composeStory(module[story] ?? {}, meta, withTheCoreAnnotations, undefined, story);
}

function withTheGeneratedControlsOnly(annotations: Annotations): Annotations {
  return Object.fromEntries(
    Object.entries(annotations).filter(([key]) => !keysThatChangeControls.has(key)),
  );
}

function componentOf(module: StoryModule): string | undefined {
  return Object.keys(libraryComponentProps()).find(
    (name) => builtByName[name] === module.default?.component,
  );
}

test("every story of every component the library exports is composed with exactly the controls the generated argTypes give each public prop, with no controls parameters, no argType that names no prop, and no table.disable, if or other change", () => {
  const problems = indexed.flatMap(({ file, stories, module }) => {
    const component = componentOf(module);
    if (component === undefined) return [];
    const generated = argTypesOfEachComponent()[component];
    const written = [module.default, ...stories.map((story) => module[story] ?? {})].flatMap(
      ({ argTypes }) => Object.keys(argTypes ?? {}),
    );
    const strays = [...new Set(written)]
      .filter((name) => !(name in generated))
      .map(
        (name) =>
          `${file}: an argType names ${name}, which is no prop of ${component}. Write no argTypes: argTypesOf gives them.`,
      );
    return [
      ...strays,
      ...stories.flatMap((story) => {
        const { parameters, argTypes } = composed(module, story);
        const meta = { ...withTheGeneratedControlsOnly(module.default), argTypes: generated };
        const expected = composed(
          { default: meta, [story]: withTheGeneratedControlsOnly(module[story] ?? {}) },
          story,
        ).argTypes;
        const controls =
          "controls" in parameters
            ? [
                `${file}: the story ${story} is composed with the controls parameters ${JSON.stringify(parameters.controls)}, which can hide or filter its controls. Write no parameters.controls: a meta typed ComponentMeta and a story typed ComponentStory from "#/story-meta.ts" take none.`,
              ]
            : [];
        const changed = Object.keys(generated).flatMap((name) =>
          isDeepStrictEqual(argTypes[name], expected[name])
            ? []
            : [
                `${file}: the story ${story} composes ${component}'s prop ${name} to the argType ${JSON.stringify(argTypes[name])}, not ${JSON.stringify(expected[name])}, which argTypesOf gives. Set the meta's argTypes to argTypesOf(${component}) from "virtual:story-controls", type it satisfies ComponentMeta<typeof ${component}>, and write no other argTypes or spread over them.`,
              ],
        );
        return [...controls, ...changed];
      }),
    ];
  });

  expect(Object.values(libraryComponentProps()).flat().length).toBeGreaterThan(0);
  expect(indexed.length).toBeGreaterThan(0);
  expect(problems).toEqual([]);
});

test("the controls add no arg: each composed story's args are the args its file writes", () => {
  const added = indexed.flatMap(({ file, stories, module }) =>
    stories.flatMap((story) => {
      const { args } = composed(module, story);
      const written = Object.keys({ ...module.default.args, ...module[story]?.args });
      const extra = Object.keys(args).filter((name) => !written.includes(name));
      return extra.length === 0
        ? []
        : [
            `${file}: the story ${story} is given ${extra.join(", ")}, which its file does not write; an argType with an action or a default adds an arg the gates then run on.`,
          ];
    }),
  );

  expect(indexed.flatMap(({ stories }) => stories).length).toBeGreaterThan(0);
  expect(added).toEqual([]);
});

function writesAfterEach(annotations: object): boolean {
  return "afterEach" in annotations && annotations.afterEach !== undefined;
}

test("no indexed story or meta writes afterEach, so the play phase the story spec counts ends in the preview's afterEach, right after the play function", () => {
  const written = indexed.flatMap(({ file, stories, module }) =>
    [
      ...(writesAfterEach(module.default) ? ["its meta"] : []),
      ...stories.filter((story) => writesAfterEach(module[story] ?? {})),
    ].map(
      (writer) =>
        `${file}: ${writer} writes afterEach, which runs after the play function and before the preview's afterEach ends the play phase, so an assertion there would count as the play's. Check it in the play function.`,
    ),
  );

  expect(indexed.flatMap(({ stories }) => stories).length).toBeGreaterThan(0);
  expect(written).toEqual([]);
});
