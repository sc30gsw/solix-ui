import type { StoryIndexEntry } from "storybook/internal/types";
import { beforeAll, expect, inject, test } from "vite-plus/test";
import type { Option } from "../../../scripts/component-props.ts";
import { type RecordedStory, recordedStories } from "#/story-records-command.ts";
import {
  openSpecProgram,
  type SpecComponent,
  type SpecProp,
} from "../../../scripts/component-spec.ts";
import { storyIndex } from "#/tests/support/stories.ts";

type Holder = { readonly kind: "component"; readonly name: string } | { readonly kind: "shared" };
type Held = { readonly holder: Holder; readonly prop: SpecProp };
type Received = {
  readonly component: string;
  readonly prop: string;
  readonly value: unknown;
  readonly played: boolean;
};

const indexTimeout = 120_000;
let components: SpecComponent[] = [];
let stories: StoryIndexEntry[] = [];
let records: RecordedStory[] = [];
let received: Received[] = [];

beforeAll(async () => {
  const directory = inject("storyRecords");
  if (directory === undefined) {
    throw new Error(
      "No directory for the stories' records was provided. The story spec project's global setup, apps/storybook/story-records-command.ts, provides it; list it in that project's globalSetup.",
    );
  }
  stories = await storyIndex();
  const indexed = new Set(stories.map(({ id }) => id));
  records = recordedStories(directory).filter(({ storyId }) => indexed.has(storyId));
  received = records.flatMap(({ mounts }) =>
    mounts.flatMap(({ component, props, played }) =>
      Object.entries(props).map(([prop, value]) => ({ component, prop, value, played })),
    ),
  );
  const opened = openSpecProgram();
  components = opened.components;
  opened.program.dispose();
}, indexTimeout);

function held(keep: (prop: SpecProp) => boolean): Held[] {
  const shared = new Set<string>();
  return components.flatMap((component) =>
    component.props.filter(keep).flatMap((prop): Held[] => {
      if (!prop.common) return [{ holder: { kind: "component", name: component.name }, prop }];
      if (shared.has(prop.name)) return [];
      shared.add(prop.name);
      return [{ holder: { kind: "shared" }, prop }];
    }),
  );
}

function receivedBy({ holder, prop }: Held): Received[] {
  return received.filter(
    (entry) =>
      entry.prop === prop.name && (holder.kind === "shared" || entry.component === holder.name),
  );
}

function named({ holder, prop }: Held): string {
  return holder.kind === "component"
    ? `${holder.name}'s prop ${prop.name}`
    : `the shared prop ${prop.name}`;
}

function where({ holder }: Held): string {
  return holder.kind === "component" ? `a story of ${holder.name}` : "any story";
}

test("every indexed story ran in the stories projects of this run and sent a record of the library components it mounted", () => {
  const unrecorded = stories
    .filter(({ id }) => !records.some(({ storyId }) => storyId === id))
    .map(
      ({ id }) =>
        `${id}: no record of this story reached this run. Run vp test without --project, so the stories projects run before the story spec.`,
    );

  expect(stories.length).toBeGreaterThan(0);
  expect(unrecorded).toEqual([]);
});

test("every own prop of every component was received by that component, mounted in the canvas of an indexed story, and every prop the element components share by some component", () => {
  const unused = held(() => true)
    .filter((entry) => receivedBy(entry).length === 0)
    .map(
      (entry) =>
        `No indexed story mounted a component that received ${named(entry)}. Give it in ${where(entry)}.`,
    );

  expect(unused).toEqual([]);
});

test("every value of every prop whose type is a closed union of literals was received by a component mounted in its story's canvas", () => {
  const missing = held(({ values }) => values !== undefined).flatMap((entry) => {
    const seen = new Set(receivedBy(entry).map(({ value }) => value));
    const unseen = (entry.prop.values ?? []).filter((value: Option) => !seen.has(value));
    return unseen.length === 0
      ? []
      : [
          `No indexed story mounted a component that received ${named(entry)} as ${unseen.join(", ")}. ${
            entry.prop.behaviour
              ? `Give it as each in ${where(entry)} whose play function checks what that value does.`
              : `Export everyValueOf(meta, "${entry.prop.name}") from "#/every-value.tsx" in ${where(entry)}.`
          }`,
        ];
  });

  expect(missing).toEqual([]);
});

test("every prop with behaviour, which its type tells, was received by a component in its story's canvas when the story ended, after which mount the story's play function made an expect assertion", () => {
  const behaviour = held(({ behaviour }) => behaviour);
  const unplayed = behaviour
    .filter((entry) => receivedBy(entry).every(({ played }) => !played))
    .map(
      (entry) =>
        `No story ended with a component that received ${named(entry)} in its canvas after its play function made an expect assertion of storybook/test while that component was mounted. Give it in ${where(entry)} whose play function checks what it does with expect.`,
    );

  expect(behaviour.length).toBeGreaterThan(0);
  expect(unplayed).toEqual([]);
});
