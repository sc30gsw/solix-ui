import { createComponent, renderToStream } from "@solidjs/web";
import { createMemo, Loading } from "solid-js";
import { expect, test } from "vite-plus/test";
import type { GridProps } from "#/src/index.ts";
import { library } from "#/tests/built-library.ts";

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
    offset: { md: 1 },
    children: "Half",
  });
}

const queried: Record<"media" | "container", GridProps> = {
  media: { type: "media" },
  container: { type: "container", breakpoints },
};

async function chunksFrom(grid: Parameters<typeof renderToStream>[0]): Promise<string[]> {
  const stream = renderToStream(grid);
  const chunks: string[] = [];
  await new Promise<void>((resolve) => {
    Reflect.apply(Reflect.get(stream, "pipe"), stream, [
      { write: (chunk) => chunks.push(String(chunk)), end: () => resolve() } satisfies Sink,
    ]);
  });
  return chunks;
}

function chunksOf(type: "media" | "container"): Promise<string[]> {
  return chunksFrom(() =>
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

const flexBasisRule = ".sx-col-flex-basis-c0-2{";
const offsetRule = ".sx-col-offset-c0-2{";

test("in a streaming render, a Grid writes one container hydration flag and each column writes its own rules", async () => {
  const chunks = await chunksFrom(() =>
    createComponent(library.Grid, {
      type: "container",
      breakpoints,
      get children() {
        return [
          createComponent(library.GridCol, { span: { base: 12, md: 6 }, children: "First" }),
          createComponent(Loading, {
            fallback,
            get children() {
              return createComponent(AsyncColumn, {});
            },
          }),
        ];
      },
    }),
  );
  const [shell = "", ...rest] = chunks;
  const later = rest.join("");

  expect(shell).toContain(fallback);
  expect(shell).toContain(flexBasisRule);
  expect(shell).toContain("solix:qc:");
  expect(later).toContain("Half");
  expect(later).toContain(flexBasisRule);
  expect(later).toContain(offsetRule);
  expect(later).not.toContain("solix:qc:");
});

test("a responsive fallback column inside Loading does not suppress a later shell column or the resolved column", async () => {
  const chunks = await chunksFrom(() =>
    createComponent(library.Grid, {
      type: "container",
      breakpoints,
      get children() {
        return [
          createComponent(Loading, {
            get fallback() {
              return createComponent(library.GridCol, {
                span: { base: 12, md: 6 },
                children: fallback,
              });
            },
            get children() {
              return createComponent(AsyncColumn, {});
            },
          }),
          createComponent(library.GridCol, { span: { base: 12, md: 6 }, children: "Shell" }),
        ];
      },
    }),
  );
  const [shell = "", ...rest] = chunks;
  const later = rest.join("");

  expect(shell.split(flexBasisRule)).toHaveLength(3);
  expect(shell).toContain("Shell");
  expect(later).toContain("Half");
  expect(later).toContain(flexBasisRule);
  expect(later).toContain(offsetRule);
});

test("a wrapped shell column after Loading still writes its own rules in the shell", async () => {
  function WrappedColumn() {
    return createComponent(library.GridCol, {
      span: { base: 12, md: 6 },
      children: "Wrapped",
    });
  }
  const chunks = await chunksFrom(() =>
    createComponent(library.Grid, {
      type: "container",
      breakpoints,
      get children() {
        return [
          createComponent(Loading, {
            fallback,
            get children() {
              return createComponent(AsyncColumn, {});
            },
          }),
          createComponent(WrappedColumn, {}),
        ];
      },
    }),
  );
  const [shell = "", ...rest] = chunks;
  const later = rest.join("");

  expect(shell).toContain("Wrapped");
  expect(shell).toContain(flexBasisRule);
  expect(later).toContain("Half");
  expect(later).toContain(flexBasisRule);
  expect(later).toContain(offsetRule);
});

test("two sibling Loading boundaries each stream their column with its own rules", async () => {
  function SecondAsyncColumn() {
    const span = createMemo(async () => {
      await new Promise((resolve) => setTimeout(resolve, columnDelay + 40));
      return 4;
    });
    return createComponent(library.GridCol, {
      get span() {
        return { base: 12, md: span() };
      },
      children: "Third",
    });
  }
  const chunks = await chunksFrom(() =>
    createComponent(library.Grid, {
      type: "container",
      breakpoints,
      get children() {
        return [
          createComponent(Loading, {
            fallback: "First fallback",
            get children() {
              return createComponent(AsyncColumn, {});
            },
          }),
          createComponent(Loading, {
            fallback: "Second fallback",
            get children() {
              return createComponent(SecondAsyncColumn, {});
            },
          }),
        ];
      },
    }),
  );
  const [shell = "", ...rest] = chunks;
  const later = rest.join("");

  expect(shell).toContain("First fallback");
  expect(shell).toContain("Second fallback");
  expect(later).toContain("Half");
  expect(later).toContain("Third");
  expect(later.split(flexBasisRule)).toHaveLength(3);
  expect(later).toContain(offsetRule);
});

test("a synchronous column sharing a Loading boundary with a waiting column keeps its rules when the boundary retries", async () => {
  const chunks = await chunksFrom(() =>
    createComponent(library.Grid, {
      type: "container",
      breakpoints,
      get children() {
        return [
          createComponent(Loading, {
            fallback,
            get children() {
              return [
                createComponent(library.GridCol, {
                  span: { base: 12, md: 6 },
                  children: "Beside async",
                }),
                createComponent(AsyncColumn, {}),
              ];
            },
          }),
          createComponent(library.GridCol, { span: { base: 12, md: 6 }, children: "Second" }),
        ];
      },
    }),
  );
  const [shell = "", ...rest] = chunks;
  const later = rest.join("");

  expect(shell).toContain("Second");
  expect(shell).toContain(flexBasisRule);
  expect(later).toContain("Beside async");
  expect(later).toContain("Half");
  expect(later.split(flexBasisRule)).toHaveLength(3);
  expect(later).toContain(offsetRule);
});
