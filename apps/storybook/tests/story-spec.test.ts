import { join } from "node:path";
import type { StoryIndexEntry } from "storybook/internal/types";
import { beforeAll, expect, test } from "vite-plus/test";
import { type LibraryProp, libraryComponentProps } from "../../../scripts/component-props.ts";
import { repositoryRoot } from "../../../scripts/repository.ts";
import { type StoryUse, storyUses } from "../../../scripts/story-usage.ts";
import { library } from "../../../packages/core/tests/built-library.ts";
import { propShownByEveryValueOf } from "#/every-value.tsx";
import { storyFileOf, storyIndex } from "#/tests/support/stories.ts";

type StoryModule = { readonly default: { readonly component?: unknown } } & Readonly<
  Record<string, object | undefined>
>;
type IndexedFile = {
  readonly file: string;
  readonly component: string | undefined;
  readonly module: StoryModule;
  readonly uses: readonly StoryUse[];
};

const sharedStories = "apps/storybook/src/CommonProps.stories.tsx";
const builtByName: Record<string, unknown> = library;
const indexTimeout = 120_000;
let indexed: IndexedFile[] = [];

beforeAll(async () => {
  const files = [
    ...new Set((await storyIndex()).map((entry: StoryIndexEntry) => storyFileOf(entry))),
  ];
  const uses = storyUses(files.map((file) => join(repositoryRoot, file)));
  indexed = await Promise.all(
    files.map(async (file) => {
      const module = (await import(join(repositoryRoot, file))) as StoryModule;
      return {
        file,
        module,
        component: Object.keys(libraryComponentProps()).find(
          (name) => builtByName[name] === module.default.component,
        ),
        uses: uses[join(repositoryRoot, file)] ?? [],
      };
    }),
  );
}, indexTimeout);

function eachProp(
  keep: (prop: LibraryProp) => boolean,
): { component: string; prop: LibraryProp; files: IndexedFile[] }[] {
  const shared = indexed.filter(({ file }) => file === sharedStories);
  const commonSeen = new Set<string>();
  return Object.entries(libraryComponentProps()).flatMap(([component, props]) =>
    props.filter(keep).flatMap((prop) => {
      if (!prop.common) {
        return [{ component, prop, files: indexed.filter((file) => file.component === component) }];
      }
      if (commonSeen.has(prop.name)) return [];
      commonSeen.add(prop.name);
      return [{ component: "the shared stories", prop, files: shared }];
    }),
  );
}

function whereToShow(component: string): string {
  return component === "the shared stories"
    ? `${sharedStories}, which shows the props every element component shares once`
    : `a story file of ${component}`;
}

test(`every own prop of every component is used by a story of that component, and every prop the element components share by a story of ${sharedStories}, as an arg, an attribute on the component or a value everyValueOf shows`, () => {
  const unused = eachProp(() => true)
    .filter(({ prop, files }) =>
      files.every(({ uses }) => uses.every(({ props }) => !props.includes(prop.name))),
    )
    .map(
      ({ component, prop }) =>
        `${component === "the shared stories" ? "A shared" : component}: no story uses the prop ${prop.name}. Use it in ${whereToShow(component)}.`,
    );

  expect(unused).toEqual([]);
  expect(indexed.some(({ file }) => file === sharedStories)).toBe(true);
});

test("every prop whose type is a closed union of literals has a story made by everyValueOf that shows each of its values side by side", () => {
  const unshown = eachProp(({ values }) => values !== undefined)
    .filter(({ prop, files }) =>
      files.every(({ module }) =>
        Object.values(module).every(
          (story) =>
            typeof story !== "object" ||
            story === null ||
            propShownByEveryValueOf(story) !== prop.name,
        ),
      ),
    )
    .map(
      ({ component, prop }) =>
        `${component === "the shared stories" ? "A shared" : component}: no story shows every value of ${prop.name} (${(prop.values ?? []).map(String).join(", ")}). Export everyValueOf(meta, "${prop.name}") from "#/every-value.tsx" in ${whereToShow(component)}.`,
    );

  expect(unshown).toEqual([]);
});

test("every prop with behaviour, which its type tells (a callback, either prop of a value and its default, or a boolean of a component that has one of those or a required boolean), is set by a story that has a play function", () => {
  const unplayed = eachProp(({ behaviour }) => behaviour)
    .filter(({ prop, files }) =>
      files.every(({ uses }) =>
        uses.every(({ props, played }) => !played || !props.includes(prop.name)),
      ),
    )
    .map(
      ({ component, prop }) =>
        `${component}: no story with a play function sets the prop ${prop.name}. Set it in a story of ${component} whose play function checks what it does.`,
    );

  expect(eachProp(({ behaviour }) => behaviour).length).toBeGreaterThan(0);
  expect(unplayed).toEqual([]);
});
