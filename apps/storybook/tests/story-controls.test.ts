import { join } from "node:path";
import type { StoryIndexEntry } from "storybook/internal/types";
import { getCoreAnnotations } from "storybook/internal/csf";
import { composeConfigs, composeStory } from "storybook/preview-api";
import { beforeAll, expect, test } from "vite-plus/test";
import { libraryComponentProps } from "../../../scripts/component-props.ts";
import { repositoryRoot } from "../../../scripts/repository.ts";
import { type StoryControl, storyControlOf } from "../../../scripts/story-controls.ts";
import { library } from "../../../packages/core/tests/built-library.ts";
import { storyFileOf, storyIndex } from "#/tests/support/stories.ts";

type Controls = Readonly<Record<string, Partial<StoryControl> | undefined>>;
type Annotations = { component?: unknown; args?: object; argTypes?: Controls };
type StoryModule = { readonly default: Annotations } & Readonly<
  Record<string, Annotations | undefined>
>;
type IndexedFile = { file: string; stories: string[]; module: StoryModule };

const builtByName: Record<string, unknown> = library;
const indexTimeout = 60_000;
let indexed: IndexedFile[] = [];

function notRendered(): never {
  throw new Error("This test composes the stories for their args and renders none.");
}

const withTheCoreAnnotations = composeConfigs([...getCoreAnnotations(), { render: notRendered }]);

beforeAll(async () => {
  const stories = await storyIndex();
  const files = [...new Set(stories.map(storyFileOf))];
  indexed = await Promise.all(
    files.map(async (file) => ({
      file,
      stories: stories
        .filter((story: StoryIndexEntry) => storyFileOf(story) === file)
        .flatMap(({ exportName }) => (exportName === undefined ? [] : [exportName])),
      module: (await import(join(repositoryRoot, file))) as StoryModule,
    })),
  );
}, indexTimeout);

function controlOf(given: Partial<StoryControl> | undefined): string {
  return JSON.stringify(
    given?.options === undefined
      ? { control: given?.control ?? false }
      : { control: given.control ?? false, options: given.options },
  );
}

function annotationName(story: string): string {
  return story === "default" ? "the meta" : `the story ${story}`;
}

function problemsOf({ file, stories, module }: IndexedFile): string[] {
  const component = Object.keys(libraryComponentProps()).find(
    (name) => builtByName[name] === module.default?.component,
  );
  if (component === undefined) return [];
  const props = libraryComponentProps()[component];
  const metaControls = module.default?.argTypes ?? {};
  const missing = props
    .filter(({ name }) => metaControls[name] === undefined)
    .map(
      ({ name }) =>
        `${file}: the meta gives ${component}'s prop ${name} no control. Set the meta's argTypes to argTypesOf(${component}) from "virtual:story-controls", and type the meta with satisfies ComponentMeta<typeof ${component}> from "#/story-meta.ts".`,
    );
  const given = ["default", ...stories].flatMap((story) =>
    Object.entries(module[story]?.argTypes ?? {}).flatMap(([name, control]) => {
      const prop = props.find((candidate) => candidate.name === name);
      if (prop === undefined) {
        return [
          `${file}: the argTypes of ${annotationName(story)} name ${name}, which is no prop of ${component}. Write no argTypes: argTypesOf gives them.`,
        ];
      }
      const typed = JSON.stringify(storyControlOf(prop));
      return controlOf(control) === typed
        ? []
        : [
            `${file}: ${annotationName(story)} gives ${component}'s prop ${name} the control ${controlOf(control)}, not ${typed}, the control its type gives. Write no argTypes: argTypesOf gives them, and a story typed ComponentStory from "#/story-meta.ts" takes none.`,
          ];
    }),
  );
  return [...missing, ...given];
}

test("every public prop of every component the library exports, resolved through the type checker, has the control its type gives in the meta of each story file of that component, and no control names a prop the component does not take", () => {
  expect(Object.values(libraryComponentProps()).flat().length).toBeGreaterThan(0);
  expect(indexed.flatMap(problemsOf)).toEqual([]);
});

test("the controls add no arg: each composed story's args are the args its file writes", () => {
  const added = indexed.flatMap(({ file, stories, module }) =>
    stories.flatMap((story) => {
      const { args } = composeStory(
        module[story] ?? {},
        module.default,
        withTheCoreAnnotations,
        undefined,
        story,
      );
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
