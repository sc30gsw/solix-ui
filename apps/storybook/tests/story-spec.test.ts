import { rmSync, readdirSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import type { StoryIndexEntry } from "storybook/internal/types";
import { beforeAll, expect, inject, test } from "vite-plus/test";
import type { Option } from "../../../scripts/component-props.ts";
import { type RecordedStory, recordedStories } from "#/story-records-command.ts";
import {
  openSpecProgram,
  type SpecComponent,
  type SpecProp,
} from "#/tests/support/component-spec.ts";
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
  for (const run of readdirSync(dirname(directory), { withFileTypes: true })) {
    if (run.isDirectory() && run.name !== basename(directory)) {
      rmSync(join(dirname(directory), run.name), { recursive: true, force: true });
    }
  }
  stories = await storyIndex();
  const indexed = new Set(stories.map(({ id }) => id));
  records = recordedStories(directory).filter(({ storyId }) => indexed.has(storyId));
  received = records.flatMap(({ mounts }) =>
    mounts.flatMap(({ component, props, mountedWhenPlayEnded }) =>
      Object.entries(props).map(([prop, value]) => ({
        component,
        prop,
        value,
        played: mountedWhenPlayEnded,
      })),
    ),
  );
  const opened = openSpecProgram([]);
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

test("every own prop of every component was received by that component, mounted in an indexed story, and every prop the element components share by some component", () => {
  const unused = held(() => true)
    .filter((entry) => receivedBy(entry).length === 0)
    .map(
      (entry) =>
        `No indexed story mounted a component that received ${named(entry)}. Give it in ${where(entry)}.`,
    );

  expect(unused).toEqual([]);
});

test("every value of every prop whose type is a closed union of literals was received by a mounted component", () => {
  const missing = held(({ values }) => values !== undefined).flatMap((entry) => {
    const seen = new Set(receivedBy(entry).map(({ value }) => value));
    const unseen = (entry.prop.values ?? []).filter((value: Option) => !seen.has(value));
    return unseen.length === 0
      ? []
      : [
          `No indexed story mounted a component that received ${named(entry)} as ${unseen.join(", ")}. Export everyValueOf(meta, "${entry.prop.name}") from "#/every-value.tsx" in ${where(entry)}.`,
        ];
  });

  expect(missing).toEqual([]);
});

test("every prop with behaviour, which its type tells, was received by a component still mounted when a play function of its story ended", () => {
  const behaviour = held(({ behaviour }) => behaviour);
  const unplayed = behaviour
    .filter((entry) => receivedBy(entry).every(({ played }) => !played))
    .map(
      (entry) =>
        `No play function ended while a component that received ${named(entry)} was mounted. Give it in ${where(entry)} whose play function checks what it does.`,
    );

  expect(behaviour.length).toBeGreaterThan(0);
  expect(unplayed).toEqual([]);
});
