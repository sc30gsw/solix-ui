import { join } from "node:path";
import { afterAll, beforeAll, expect, test } from "vite-plus/test";
import { repositoryRoot } from "../../../scripts/repository.ts";
import type { Program } from "../../../scripts/syntax.ts";
import {
  openSpecProgram,
  type SpecComponent,
  type SpecProp,
} from "#/tests/support/component-spec.ts";
import { indexedStoryFiles } from "#/tests/support/stories.ts";
import { everyValueFile, type StoryFileUse, storyFileUse } from "#/tests/support/story-usage.ts";

type Holder = { readonly kind: "component"; readonly name: string } | { readonly kind: "shared" };
type Held = {
  readonly holder: Holder;
  readonly prop: SpecProp;
  readonly files: readonly StoryFileUse[];
};

const storyControlsDeclarations = join(repositoryRoot, "apps/storybook/story-controls.d.ts");
const indexTimeout = 120_000;
let program: Program | undefined;
let components: SpecComponent[] = [];
let uses: StoryFileUse[] = [];

beforeAll(async () => {
  const indexed = await indexedStoryFiles();
  const files = indexed.map(({ file }) => join(repositoryRoot, file));
  ({ program, components } = openSpecProgram([
    ...files,
    storyControlsDeclarations,
    everyValueFile,
  ]));
  const opened = program;
  uses = indexed.map(({ file, stories }) =>
    storyFileUse(opened, join(repositoryRoot, file), stories),
  );
}, indexTimeout);

afterAll(() => program?.dispose());

function filesOf(component: SpecComponent): StoryFileUse[] {
  return uses.filter((use) =>
    use.component.some((declaration) => component.declarations.includes(declaration)),
  );
}

function held(keep: (prop: SpecProp) => boolean): Held[] {
  const shared = new Set<string>();
  return components.flatMap((component) =>
    component.props.filter(keep).flatMap((prop): Held[] => {
      if (!prop.common) {
        return [
          { holder: { kind: "component", name: component.name }, prop, files: filesOf(component) },
        ];
      }
      if (shared.has(prop.name)) return [];
      shared.add(prop.name);
      return [{ holder: { kind: "shared" }, prop, files: uses }];
    }),
  );
}

function named({ holder, prop }: Held): string {
  return holder.kind === "component"
    ? `${holder.name}'s prop ${prop.name}`
    : `the shared prop ${prop.name}`;
}

function where({ holder }: Held): string {
  return holder.kind === "component" ? `a story file of ${holder.name}` : "any story file";
}

test("every own prop of every component is used by an indexed story of that component, and every prop the element components share by an indexed story anywhere: as an arg its render passes to the component, an attribute or children on the component, or a value everyValueOf shows", () => {
  const unused = held(() => true)
    .filter(({ prop, files }) =>
      files.every(({ stories }) => stories.every(({ props }) => !props.has(prop.name))),
    )
    .map((entry) => `No story uses ${named(entry)}. Use it in ${where(entry)}.`);

  expect(uses.flatMap(({ problems }) => problems)).toEqual([]);
  expect(unused).toEqual([]);
});

test("every prop whose type is a closed union of literals is shown whole by an indexed story made by everyValueOf from its file's own meta", () => {
  const unshown = held(({ values }) => values !== undefined)
    .filter(({ prop, files }) =>
      files.every(({ stories }) => stories.every(({ shows }) => shows !== prop.name)),
    )
    .map(
      (entry) =>
        `No story shows every value of ${named(entry)} (${(entry.prop.values ?? []).join(", ")}). Export everyValueOf(meta, "${entry.prop.name}") from "#/every-value.tsx" in ${where(entry)}.`,
    );

  expect(unshown).toEqual([]);
});

test("every prop with behaviour, which its type tells, is set by an indexed story whose play function is a function", () => {
  const behaviour = held(({ behaviour }) => behaviour);
  const unplayed = behaviour
    .filter(({ prop, files }) =>
      files.every(({ stories }) =>
        stories.every(({ props, played }) => !played || !props.has(prop.name)),
      ),
    )
    .map(
      (entry) =>
        `No story with a play function sets ${named(entry)}. Set it in ${where(entry)} whose play function checks what it does.`,
    );

  expect(behaviour.length).toBeGreaterThan(0);
  expect(unplayed).toEqual([]);
});
