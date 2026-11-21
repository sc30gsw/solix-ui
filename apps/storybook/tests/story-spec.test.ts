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
};

const indexTimeout = 120_000;
let components: SpecComponent[] = [];
let stories: StoryIndexEntry[] = [];
let records: RecordedStory[] = [];
let received: Received[] = [];
let played: Received[] = [];

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
    mounts.flatMap(({ component, given, values }) =>
      given.flatMap((prop) =>
        (values[prop] ?? [undefined]).map((value) => ({ component, prop, value })),
      ),
    ),
  );
  played = records.flatMap(({ mounts }) =>
    mounts.flatMap((mount) =>
      mount.played.map(({ prop, value }) => ({ component: mount.component, prop, value })),
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

function receivedBy({ holder, prop }: Held, among: readonly Received[] = received): Received[] {
  return among.filter(
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

test("every indexed story ran again in Chromium with each value of a behaviour prop it gives substituted", () => {
  const unsubstituted = stories
    .filter(({ id }) => !records.some(({ storyId, substituted }) => storyId === id && substituted))
    .map(
      ({ id }) =>
        `${id}: no record of this story from Chromium, where each value it gives a behaviour prop is substituted and the story run again, reached this run, so none of its behaviour is known to be played. Run vp test without --project, with Chromium installed, or with a --project filter that keeps a stories project in Chromium.`,
    );

  expect(unsubstituted).toEqual([]);
});

test("every prop with behaviour has another value to substitute for it, which its type gives", () => {
  const unplayable = held(({ behaviour }) => behaviour)
    .filter(({ prop }) => prop.substitute === undefined)
    .map(
      (entry) =>
        `${named(entry)} is not playable: its type, ${entry.prop.type}, gives no other value to substitute for it. A closed union gives another of its literals, a callback or an object of callbacks a no-op of its type, a type that takes null gives null; give it such a type.`,
    );

  expect(unplayable).toEqual([]);
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

test("every value of every prop whose type is a closed union of literals was received by a component mounted in its story's canvas, and every value of one with behaviour played: its story's play function passed as written and failed with another value substituted for it", () => {
  const missing = held(({ values }) => values !== undefined).flatMap((entry) => {
    const seen = new Set(
      receivedBy(entry, entry.prop.behaviour ? played : received).map(({ value }) => value),
    );
    const unseen = (entry.prop.values ?? []).filter((value: Option) => !seen.has(value));
    return unseen.length === 0
      ? []
      : [
          entry.prop.behaviour
            ? `No story's play function failed when ${named(entry)} as ${unseen.join(", ")}, received by a component mounted in its canvas, was substituted with another value, while it passed as written. Give it as each in ${where(entry)} whose play function checks what that value does, so another value fails it.`
            : `No indexed story mounted a component that received ${named(entry)} as ${unseen.join(", ")}. Export everyValueOf(meta, "${entry.prop.name}") from "#/every-value.tsx" in ${where(entry)}.`,
        ];
  });

  expect(missing).toEqual([]);
});

test("every prop with behaviour, which its type tells, played: a component in its story's canvas received it, and the story's play function passed as written and failed with another value substituted for it", () => {
  const behaviour = held(({ behaviour }) => behaviour);
  const unplayed = behaviour
    .filter((entry) => receivedBy(entry, played).length === 0)
    .map(
      (entry) =>
        `No story's play function failed when ${named(entry)}, received by a component mounted in its canvas, was substituted with another value, while it passed as written. Give it in ${where(entry)} whose play function checks what it does, so another value fails it.`,
    );

  expect(behaviour.length).toBeGreaterThan(0);
  expect(unplayed).toEqual([]);
});
