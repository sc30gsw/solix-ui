import { join } from "node:path";
import { beforeAll, expect, test } from "vite-plus/test";
import { repositoryRoot } from "../../../scripts/repository.ts";
import { argTypesOfEachComponent } from "../../../scripts/story-controls.ts";
import { breakpointNames, breakpointsAlikeAt, separatingWidths } from "#/every-breakpoint.ts";
import { type IndexedStoryFile, indexedStoryFiles } from "#/tests/support/stories.ts";

const indexTimeout = 60_000;
let indexed: IndexedStoryFile[] = [];

beforeAll(async () => {
  indexed = await indexedStoryFiles();
}, indexTimeout);

const byText = (a: string, b: string) => a.localeCompare(b);

type EveryValue = { readonly prop: string; readonly viewport: number | undefined };

function everyValueOfStory(story: unknown): EveryValue | undefined {
  if (typeof story !== "object" || story === null) return undefined;
  const parameters: unknown = Reflect.get(story, "parameters");
  if (typeof parameters !== "object" || parameters === null) return undefined;
  const everyValue: unknown = Reflect.get(parameters, "everyValue");
  if (typeof everyValue !== "object" || everyValue === null) return undefined;
  const prop: unknown = Reflect.get(everyValue, "prop");
  const viewport: unknown = Reflect.get(everyValue, "viewport");
  return typeof prop === "string"
    ? { prop, viewport: typeof viewport === "number" ? viewport : undefined }
    : undefined;
}

test("the widths that separate the breakpoints lie between each two neighbours, so at some width every two breakpoints fall on different sides", () => {
  const apart = breakpointNames.flatMap((name, at) =>
    breakpointNames.slice(at + 1).map((other) => [name, other]),
  );
  const told = apart.filter((pair) =>
    separatingWidths.some(
      (width) =>
        !breakpointsAlikeAt(width).some((group) => pair.every((name) => group.includes(name))),
    ),
  );
  expect(told).toEqual(apart);
});

test("every prop that takes a breakpoint has an everyValueOf story at each width that separates two breakpoints, and none at another width or at none", async () => {
  const breakpointProps = new Set(
    Object.values(argTypesOfEachComponent()).flatMap((argTypes) =>
      Object.entries(argTypes).flatMap(([prop, { options }]) =>
        JSON.stringify((options ?? []).map(String).sort(byText)) ===
        JSON.stringify([...breakpointNames].sort(byText))
          ? [prop]
          : [],
      ),
    ),
  );
  const stories = (
    await Promise.all(
      indexed.map(async ({ file, stories: names }) => {
        const module: Record<string, unknown> = await import(join(repositoryRoot, file));
        return [...names].flatMap((name) => everyValueOfStory(module[name]) ?? []);
      }),
    )
  ).flat();
  const gaps = [...breakpointProps].flatMap((prop) => {
    const widths = stories
      .filter((story) => story.prop === prop)
      .map(({ viewport }) => String(viewport ?? "no viewport"))
      .sort(byText);
    const wanted = separatingWidths.map(String).sort(byText);
    return JSON.stringify(widths) === JSON.stringify(wanted)
      ? []
      : [
          `${prop}: its everyValueOf stories run at ${widths.join(", ") || "no width"}, where each of ${wanted.join(", ")} needs one, made by everyBreakpointValueAt(meta, "${prop}", width).`,
        ];
  });

  expect(breakpointProps.size).toBeGreaterThan(0);
  expect(gaps).toEqual([]);
});
