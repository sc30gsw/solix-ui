import { createComponent, renderToStream } from "@solidjs/web";
import { createMemo, Loading } from "solid-js";
import { expect, test } from "vite-plus/test";
import type { GridProps } from "../src/index";
import { library } from "./built-library";

const breakpoints = { xs: "5em", sm: "10em", md: "20em", lg: "60em", xl: "70em" } as const;
const fallback = "Waiting for the column";
const columnDelay = 200;

type Sink = { write: (chunk: string) => void; end: () => void };

function AsyncColumn() {
  const span = createMemo(async () => {
    await new Promise((resolve) => setTimeout(resolve, columnDelay));
    return 6;
  });
  return createComponent(library.GridCol, {
    get span() {
      return { base: 12, md: span() };
    },
    children: "Half",
  });
}

const queried: Record<"media" | "container", GridProps> = {
  media: { type: "media" },
  container: { type: "container", breakpoints },
};

async function chunksOf(type: "media" | "container"): Promise<string[]> {
  const stream = renderToStream(() =>
    createComponent(library.Grid, {
      ...queried[type],
      gap: { base: "xs", md: "xl" },
      get children() {
        return createComponent(Loading, {
          fallback,
          get children() {
            return createComponent(AsyncColumn, {});
          },
        });
      },
    }),
  );
  const chunks: string[] = [];
  await new Promise<void>((resolve) => {
    Reflect.apply(Reflect.get(stream, "pipe"), stream, [
      { write: (chunk) => chunks.push(String(chunk)), end: () => resolve() } satisfies Sink,
    ]);
  });
  return chunks;
}

test.each(["media", "container"] as const)(
  "a Grid with %s queries streams its shell, with the fallback of a column that waits, before the column",
  async (type) => {
    const [shell = "", ...rest] = await chunksOf(type);

    expect(shell).toContain(fallback);
    expect(shell).toContain("solix-Grid-root");
    expect(rest.join(""), "the column arrives in a later chunk").toContain("Half");
  },
);
