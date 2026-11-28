import type { CompiledStyles } from "@stylexjs/stylex";
import { createComponent, renderToString } from "@solidjs/web";
import { createMemo, createSignal, Errored, Loading } from "solid-js";
import { expect, expectTypeOf, test } from "vite-plus/test";
import { LIBRARY_CLASS_PREFIX } from "#/build-pipeline.mjs";
import type {
  CenterProps,
  ContainerProps,
  FlexProps,
  GridColProps,
  GridProps,
  GroupProps,
  SimpleGridProps,
  SpaceProps,
  StackProps,
} from "#/src/index.ts";
import type { createParts, PartsOptions } from "#/src/parts.ts";
import type { spaceVariables } from "#/src/Space.variables.ts";
import type { Variables } from "#/src/variables.ts";
import { breakpointWidths } from "#/src/style-prop-table.ts";
import type { ContainerWidth } from "#/src/query-container.ts";
import { builtQueryContainer, library } from "#/tests/built-library.ts";
import { expectingSolidDiagnostic } from "../../../tests/support/solid-diagnostics.ts";
import { render } from "#/tests/fixtures.ts";
import {
  classesOf,
  declarationsIn,
  type Element,
  elementCarrying,
  elementsOf,
  rootElementOf,
  rulesOf,
  valuesOf,
} from "#/tests/markup.ts";

const mdInRem = `${Number.parseFloat(breakpointWidths.md)}rem`;

type Rendered = { classes: string[]; style: Record<string, string> };

function libraryOf(name: string, props: Record<string, unknown>): Rendered {
  const root = rootElementOf(render(name, props));
  return {
    classes: classesOf(root)
      .filter((found) => found.startsWith(`${LIBRARY_CLASS_PREFIX}-`))
      .sort(),
    style: Object.fromEntries(declarationsIn(valuesOf(root, "style")[0])),
  };
}

const spaceCases: [what: string, props: SpaceProps, expected: Rendered][] = [
  [
    "w sets the width and the minimum width, so a flex row cannot shrink it",
    { w: "md" },
    {
      classes: ["sx-space-min-width", "sx-w"],
      style: {
        "--sx-space-min-width": "var(--solix-spacing-md)",
        "--sx-w": "var(--solix-spacing-md)",
      },
    },
  ],
  [
    "h sets the height and the minimum height at every breakpoint it names",
    { h: { base: 8, md: "xl" } },
    {
      classes: ["sx-h", "sx-h-md", "sx-space-min-height", "sx-space-min-height-md"],
      style: {
        "--sx-h": "0.5rem",
        "--sx-h-md": "var(--solix-spacing-xl)",
        "--sx-space-min-height": "0.5rem",
        "--sx-space-min-height-md": "var(--solix-spacing-xl)",
      },
    },
  ],
  [
    "with mih, the minimum height Space sets still follows h, and mih writes its own class, which the style-prop layer puts over it",
    { h: "xl", mih: "xs" },
    {
      classes: ["sx-h", "sx-mih", "sx-space-min-height"],
      style: {
        "--sx-h": "var(--solix-spacing-xl)",
        "--sx-mih": "var(--solix-spacing-xs)",
        "--sx-space-min-height": "var(--solix-spacing-xl)",
      },
    },
  ],
  [
    "a null mih leaves h as the minimum height",
    { h: 4, mih: null },
    {
      classes: ["sx-h", "sx-space-min-height"],
      style: { "--sx-h": "0.25rem", "--sx-space-min-height": "0.25rem" },
    },
  ],
  ...["", " "].map((mih): [string, SpaceProps, Rendered] => [
    `a mih of ${JSON.stringify(mih)} leaves h as the minimum height`,
    { h: "2rem", mih },
    {
      classes: ["sx-h", "sx-space-min-height"],
      style: { "--sx-h": "2rem", "--sx-space-min-height": "2rem" },
    },
  ]),
  ["with no size it sets nothing", {}, { classes: [], style: {} }],
];

test.each(spaceCases)("Space: %s", (_, props, expected) => {
  expect(libraryOf("Space", props)).toEqual(expected);
});

const centerCases: [
  what: string,
  props: CenterProps<"div" | "a">,
  tag: string,
  inline: (string | true)[],
][] = [
  ["renders a <div> and marks nothing by default", {}, "div", []],
  ["marks an inline Center with data-inline", { inline: true }, "div", ["true"]],
  ["leaves data-inline off when inline is false", { inline: false }, "div", []],
  [
    "renders the element component names, inline too",
    { component: "a", inline: true },
    "a",
    ["true"],
  ],
];

test.each(centerCases)("Center: %s", (_, props, tag, inline) => {
  const root: Element = rootElementOf(render("Center", props));

  expect(root.tag).toBe(tag);
  expect(valuesOf(root, "data-inline")).toEqual(inline);
});

const stackCases: [what: string, props: StackProps, expected: Rendered][] = [
  [
    "sets nothing of its own by default, so its styles give the gap md",
    {},
    { classes: [], style: {} },
  ],
  [
    "gives gap, align and justify to their variables",
    { gap: "lg", align: "center", justify: "space-between" },
    {
      classes: ["sx-stack-align", "sx-stack-gap", "sx-stack-justify"],
      style: {
        "--sx-stack-align": "center",
        "--sx-stack-gap": "var(--solix-spacing-lg)",
        "--sx-stack-justify": "space-between",
      },
    },
  ],
  [
    "writes a number of pixels as rem",
    { gap: 24 },
    { classes: ["sx-stack-gap"], style: { "--sx-stack-gap": "1.5rem" } },
  ],
];

test.each(stackCases)("Stack: %s", (_, props, expected) => {
  expect(libraryOf("Stack", props)).toEqual(expected);
});

const threeChildren = "calc((100% + var(--group-gap)) / 3 - var(--group-gap))";

const groupCases: [
  what: string,
  props: GroupProps,
  expected: Rendered & { grow: (string | true)[]; children: number },
][] = [
  [
    "sets nothing of its own by default and renders its children",
    {},
    { classes: [], style: {}, grow: [], children: 3 },
  ],
  [
    "gives gap, align, justify and wrap to their variables",
    { gap: "xs", align: "flex-start", justify: "center", wrap: "nowrap" },
    {
      classes: ["sx-group-align", "sx-group-gap", "sx-group-justify", "sx-group-wrap"],
      style: {
        "--sx-group-align": "flex-start",
        "--sx-group-gap": "var(--solix-spacing-xs)",
        "--sx-group-justify": "center",
        "--sx-group-wrap": "nowrap",
      },
      grow: [],
      children: 3,
    },
  ],
  [
    "with grow, marks itself and keeps each child to its share of the row",
    { grow: true },
    {
      classes: ["sx-group-child-width"],
      style: { "--sx-group-child-width": threeChildren },
      grow: ["true"],
      children: 3,
    },
  ],
  [
    "with grow and preventGrowOverflow false, lets each child grow past its share",
    { grow: true, preventGrowOverflow: false },
    {
      classes: ["sx-group-child-width"],
      style: { "--sx-group-child-width": "none" },
      grow: ["true"],
      children: 3,
    },
  ],
  [
    "with grow and unstyled, keeps its mark and drops the rule that grows its children",
    { grow: true, unstyled: true },
    { classes: [], style: {}, grow: ["true"], children: 3 },
  ],
];

test.each(groupCases)("Group: %s", (_, props, { grow, children, ...expected }) => {
  const html = render("Group", {
    ...props,
    get children() {
      return [
        null,
        <span>First</span>,
        false,
        "",
        0,
        true,
        <span>Second</span>,
        undefined,
        <i>Third</i>,
      ];
    },
  });
  const root = rootElementOf(html);

  expect(libraryOf("Group", { ...props, children: ["a", "b", "c"] })).toEqual(expected);
  expect(valuesOf(root, "data-grow")).toEqual(grow);
  expect(
    elementsOf(html)
      .slice(1)
      .map(({ tag }) => tag),
    "it leaves out null, undefined, booleans and the empty string",
  ).toEqual(["span", "span", "i"]);
  expect(html.replaceAll(/<[^>]*>/g, " "), "it renders no text for a boolean").not.toMatch(
    /false|true/,
  );
  expect(elementsOf(html)).toHaveLength(children + 1);
});

test("Group renders a 0 child, and counts it among the children it grows", () => {
  const html = render("Group", {
    grow: true,
    get children() {
      return [0, null, false, "", <span>One</span>];
    },
  });

  expect(html.replaceAll(/<!--[^>]*-->/g, "")).toMatch(/>0<span/);
  expect(libraryOf("Group", { grow: true, children: [0, null, false, "", "a"] }).style).toEqual({
    "--sx-group-child-width": "calc((100% + var(--group-gap)) / 2 - var(--group-gap))",
  });
});

const flexCases: [what: string, props: FlexProps<"div" | "section">, expected: Rendered][] = [
  ["sets nothing of its own by default", {}, { classes: [], style: {} }],
  [
    "gives each flexbox prop its own variable, at each breakpoint it names",
    {
      gap: { base: "xs", md: 32 },
      rowGap: "sm",
      columnGap: { lg: "xl" },
      align: "center",
      justify: { base: "flex-start", sm: "center" },
      wrap: "wrap",
      direction: { base: "column", md: "row" },
    },
    {
      classes: [
        "sx-flex-align",
        "sx-flex-column-gap-lg",
        "sx-flex-direction",
        "sx-flex-direction-md",
        "sx-flex-gap",
        "sx-flex-gap-md",
        "sx-flex-justify",
        "sx-flex-justify-sm",
        "sx-flex-row-gap",
        "sx-flex-wrap",
      ],
      style: {
        "--sx-flex-align": "center",
        "--sx-flex-column-gap-lg": "var(--solix-spacing-xl)",
        "--sx-flex-direction": "column",
        "--sx-flex-direction-md": "row",
        "--sx-flex-gap": "var(--solix-spacing-xs)",
        "--sx-flex-gap-md": "2rem",
        "--sx-flex-justify": "flex-start",
        "--sx-flex-justify-sm": "center",
        "--sx-flex-row-gap": "var(--solix-spacing-sm)",
        "--sx-flex-wrap": "wrap",
      },
    },
  ],
  [
    "keeps its variables on the element component names",
    { component: "section", gap: "md" },
    { classes: ["sx-flex-gap"], style: { "--sx-flex-gap": "var(--solix-spacing-md)" } },
  ],
];

test.each(flexCases)("Flex: %s", (_, props, expected) => {
  expect(libraryOf("Flex", props)).toEqual(expected);
  expect(rootElementOf(render("Flex", props)).tag).toBe(props.component ?? "div");
});

const containerCases: [
  what: string,
  props: ContainerProps,
  expected: Rendered & { strategy: string; fluid: (string | true)[] },
][] = [
  [
    "is the md size with the block strategy by default",
    {},
    {
      classes: ["sx-container-size"],
      style: { "--sx-container-size": "var(--solix-container-size-md)" },
      strategy: "block",
      fluid: [],
    },
  ],
  [
    "takes a size from the scale, a number of pixels or any length",
    { size: 640 },
    {
      classes: ["sx-container-size"],
      style: { "--sx-container-size": "40rem" },
      strategy: "block",
      fluid: [],
    },
  ],
  [
    "ignores size when fluid, and marks itself",
    { fluid: true, size: "xs" },
    {
      classes: ["sx-container-size"],
      style: { "--sx-container-size": "var(--solix-container-size-md)" },
      strategy: "block",
      fluid: ["true"],
    },
  ],
  [
    "names the grid strategy",
    { strategy: "grid", size: "lg" },
    {
      classes: ["sx-container-size"],
      style: { "--sx-container-size": "var(--solix-container-size-lg)" },
      strategy: "grid",
      fluid: [],
    },
  ],
  [
    "with unstyled sets no size, so no child rule lays out its children",
    { strategy: "grid", unstyled: true },
    { classes: [], style: {}, strategy: "grid", fluid: [] },
  ],
];

test.each(containerCases)("Container: %s", (_, props, { strategy, fluid, ...expected }) => {
  const root = rootElementOf(render("Container", props));

  expect(libraryOf("Container", props)).toEqual(expected);
  expect(valuesOf(root, "data-strategy")).toEqual([strategy]);
  expect(valuesOf(root, "data-fluid")).toEqual(fluid);
});

const gridRoot = "solix-SimpleGrid-root";

function simpleGridOf(props: SimpleGridProps): Rendered & {
  autoColumns: (string | true)[];
  rules: string[];
  wrapped: boolean;
} {
  const html = render("SimpleGrid", props);
  const root = elementCarrying(html, gridRoot);
  return {
    classes: classesOf(root)
      .filter((found) => found.startsWith(`${LIBRARY_CLASS_PREFIX}-`))
      .sort(),
    style: Object.fromEntries(declarationsIn(valuesOf(root, "style")[0])),
    autoColumns: valuesOf(root, "data-auto-cols"),
    rules: rulesOf(html),
    wrapped: html.includes("solix-SimpleGrid-container"),
  };
}

test("SimpleGrid: with media queries, keys its columns and spacing by breakpoint, and renders no container part and no rules", () => {
  const rendered = simpleGridOf({
    type: "media",
    cols: { base: 1, sm: 2 },
    spacing: { base: "xs", lg: 24 },
    verticalSpacing: "xl",
  });

  expect(rendered).toEqual({
    classes: [
      "sx-sg-cols",
      "sx-sg-cols-sm",
      "sx-sg-spacing-x",
      "sx-sg-spacing-x-lg",
      "sx-sg-spacing-y",
    ],
    style: {
      "--sx-sg-cols": "1",
      "--sx-sg-cols-sm": "2",
      "--sx-sg-spacing-x": "var(--solix-spacing-xs)",
      "--sx-sg-spacing-x-lg": "1.5rem",
      "--sx-sg-spacing-y": "var(--solix-spacing-xl)",
    },
    autoColumns: [],
    rules: [],
    wrapped: false,
  });
});

test("SimpleGrid's type refuses a container width key with media queries and takes a breakpoint or a container width key with container queries, and Grid's refuses breakpoints that are not container widths", () => {
  expectTypeOf<{ type: "media"; cols: { "40em": number } }>().not.toExtend<SimpleGridProps>();
  expectTypeOf<{ type: "media"; cols: { md: number } }>().toExtend<SimpleGridProps>();
  expectTypeOf<{ type: "container"; cols: { md: number } }>().toExtend<SimpleGridProps>();
  expectTypeOf<{ type: "container"; cols: { "40em": number } }>().toExtend<SimpleGridProps>();
  expectTypeOf<{ type: "container" }>().toExtend<GridProps>();
  expectTypeOf<{
    type: "container";
    breakpoints: { xs: "1px"; sm: "2px"; md: "wide"; lg: "4px"; xl: "5px" };
  }>().not.toExtend<GridProps>();
  expectTypeOf<{ type: "media"; breakpoints: Record<"xs", "1px"> }>().not.toExtend<GridProps>();
});

test("SimpleGrid: with container queries, renders its root inside the container part, keys its values by container width, and writes a rule for each width in ascending order", () => {
  const rendered = simpleGridOf({
    type: "container",
    cols: { base: 1, "500px": 3, "30em": 2 },
    spacing: { "30em": "xl" },
  });
  const widths = [...rendered.rules.join("").matchAll(/\(min-width: ([^)]+)\)/g)].map(
    ([, width]) => width,
  );

  expect(rendered.wrapped).toBe(true);
  expect(rendered.classes).toEqual([
    "sx-sg-cols",
    "sx-sg-cols-c0-0",
    "sx-sg-cols-c0-1",
    "sx-sg-spacing-x-c0-0",
  ]);
  expect(rendered.style).toEqual({
    "--sx-sg-cols": "1",
    "--sx-sg-cols-c0-0": "2",
    "--sx-sg-cols-c0-1": "3",
    "--sx-sg-spacing-x-c0-0": "var(--solix-spacing-xl)",
  });
  expect(widths).toEqual(["30em", "500px"]);
});

test("SimpleGrid: with container queries, takes a breakpoint key as the library's width for it, applied to its container's width", () => {
  const rendered = simpleGridOf({
    type: "container",
    cols: { base: 1, md: 3, "40em": 2 },
    spacing: "md",
  });
  const widths = [...rendered.rules.join("").matchAll(/\(min-width: ([^)]+)\)/g)].map(
    ([, width]) => width,
  );

  expect(rendered.wrapped).toBe(true);
  expect(rendered.style).toEqual({
    "--sx-sg-cols": "1",
    "--sx-sg-cols-c0-0": "2",
    "--sx-sg-cols-c0-1": "3",
    "--sx-sg-spacing-x": "var(--solix-spacing-md)",
  });
  expect(widths).toEqual(["40em", mdInRem]);
});

test("SimpleGrid: with minColWidth, fills the row with columns at least that wide and ignores cols, or fits them with autoFlow", () => {
  expect(
    simpleGridOf({
      type: "media",
      spacing: undefined,
      minColWidth: 200,
      cols: 3,
      autoRows: "8rem",
    }),
  ).toEqual({
    classes: ["sx-sg-auto-rows", "sx-sg-min-col-width"],
    style: { "--sx-sg-auto-rows": "8rem", "--sx-sg-min-col-width": "12.5rem" },
    autoColumns: ["auto-fill"],
    rules: [],
    wrapped: false,
  });
  expect(
    simpleGridOf({ type: "media", minColWidth: "10rem", autoFlow: "auto-fit" }).autoColumns,
  ).toEqual(["auto-fit"]);
});

const blankAtItsBase: unknown = { base: " " };

test.each([null, "", " ", "1rem;", blankAtItsBase as string])(
  "SimpleGrid: a minColWidth of %j is no minColWidth, so cols still sets the columns and no auto columns are written",
  (minColWidth) => {
    expect(simpleGridOf({ type: "media", minColWidth, cols: 3 })).toEqual(
      simpleGridOf({ type: "media", cols: 3 }),
    );
  },
);

test("SimpleGrid: two grids with container queries in one page scope their classes and rules apart", () => {
  const Built = library.SimpleGrid;
  const given = { type: "container", cols: { base: 1, "30em": 2 } } as const;
  const html = renderToString(() => [
    createComponent(Built, { ...given, children: "First" }),
    createComponent(Built, { ...given, children: "Second" }),
  ]);
  const roots = elementsOf(html).filter((element) => classesOf(element).includes(gridRoot));
  const scoped = roots.map((root) =>
    classesOf(root).filter((found) => found.startsWith("sx-sg-cols-c")),
  );
  const rules = rulesOf(html);

  expect(roots).toHaveLength(2);
  expect(scoped[0]).toHaveLength(1);
  expect(scoped[1]).toHaveLength(1);
  expect(scoped[0][0]).not.toBe(scoped[1][0]);
  expect(rules[0]).toContain(`.${scoped[0][0]}{`);
  expect(rules[0]).not.toContain(`.${scoped[1][0]}{`);
  expect(rules[1]).toContain(`.${scoped[1][0]}{`);
});

function columnIn(grid: GridProps, column: GridColProps): Rendered & { html: string } {
  const html = renderToString(() =>
    createComponent(library.Grid, {
      ...grid,
      get children() {
        return createComponent(library.GridCol, column);
      },
    }),
  );
  const col = elementCarrying(html, "solix-GridCol-root");
  return {
    classes: classesOf(col)
      .filter((found) => found.startsWith(`${LIBRARY_CLASS_PREFIX}-`))
      .sort(),
    style: Object.fromEntries(declarationsIn(valuesOf(col, "style")[0])),
    html,
  };
}

const basisOf = (share: string) =>
  `calc((100% + var(--grid-column-gap)) * ${share} - var(--grid-column-gap))`;

test("Grid gives classes.col and styles.col to each column, before the column's own classes and styles, so a column's own value wins", () => {
  expectTypeOf<{
    classes: { col: string; inner: string };
    styles: { col: { color: string } };
  }>().toExtend<GridProps>();
  const html = renderToString(() =>
    createComponent(library.Grid, {
      classes: { col: "from-grid" },
      styles: { col: { color: "red", "font-weight": "bold" } },
      get children() {
        return [
          createComponent(library.GridCol, {}),
          createComponent(library.GridCol, {
            classes: { root: "own" },
            styles: { root: { color: "blue" } },
          }),
        ];
      },
    }),
  );
  const [plain, own] = elementsOf(html)
    .filter((element) => classesOf(element).includes("solix-GridCol-root"))
    .map((element) => ({
      classes: classesOf(element).filter((found) => !found.startsWith(LIBRARY_CLASS_PREFIX)),
      style: Object.fromEntries(
        declarationsIn(valuesOf(element, "style")[0]).filter(
          ([property]) => !property.startsWith("--"),
        ),
      ),
    }));

  expect(plain).toEqual({
    classes: ["solix-GridCol-root", "from-grid"],
    style: { color: "red", "font-weight": "bold" },
  });
  expect(own).toEqual({
    classes: ["solix-GridCol-root", "from-grid", "own"],
    style: { color: "blue", "font-weight": "bold" },
  });
});

test("Grid carries GridCol as Grid.Col", () => {
  expect(Reflect.get(library.Grid, "Col")).toBe(library.GridCol);
});

test("Grid: gives justify, align, overflow and its gaps to their variables, and with media queries renders no container part", () => {
  const html = renderToString(() =>
    createComponent(library.Grid, {
      type: "media",
      justify: "center",
      align: "flex-end",
      overflow: "hidden",
      gap: { base: "xs", md: "xl" },
      rowGap: 4,
      children: "Content",
    }),
  );
  const root = elementCarrying(html, "solix-Grid-root");

  expect(rootElementOf(html)).toEqual(root);
  expect(rulesOf(html)).toEqual([]);
  expect(Object.fromEntries(declarationsIn(valuesOf(root, "style")[0]))).toEqual({
    "--sx-grid-align": "flex-end",
    "--sx-grid-gap": "var(--solix-spacing-xs)",
    "--sx-grid-gap-md": "var(--solix-spacing-xl)",
    "--sx-grid-justify": "center",
    "--sx-grid-overflow": "hidden",
    "--sx-grid-row-gap": "0.25rem",
  });
});

const columnCases: [what: string, grid: GridProps, column: GridColProps, expected: Rendered][] = [
  [
    "spans all 12 columns by default",
    {},
    {},
    {
      classes: ["sx-col-flex-basis", "sx-col-flex-grow", "sx-col-max-width"],
      style: {
        "--sx-col-flex-basis": basisOf("1"),
        "--sx-col-flex-grow": "0",
        "--sx-col-max-width": basisOf("1"),
      },
    },
  ],
  [
    "takes the share of the grid's columns its span names, at each breakpoint, with a base of 12",
    { columns: 24 },
    { span: { md: 6 } },
    {
      classes: [
        "sx-col-flex-basis",
        "sx-col-flex-basis-md",
        "sx-col-flex-grow",
        "sx-col-flex-grow-md",
        "sx-col-max-width",
        "sx-col-max-width-md",
      ],
      style: {
        "--sx-col-flex-basis": basisOf("0.5"),
        "--sx-col-flex-basis-md": basisOf("0.25"),
        "--sx-col-flex-grow": "0",
        "--sx-col-flex-grow-md": "0",
        "--sx-col-max-width": basisOf("0.5"),
        "--sx-col-max-width-md": basisOf("0.25"),
      },
    },
  ],
  [
    "with span auto, grows into the rest of its row",
    {},
    { span: "auto" },
    {
      classes: ["sx-col-flex-basis", "sx-col-flex-grow", "sx-col-max-width"],
      style: {
        "--sx-col-flex-basis": "0rem",
        "--sx-col-flex-grow": "1",
        "--sx-col-max-width": "100%",
      },
    },
  ],
  [
    "with span content, takes the width of its content",
    {},
    { span: "content" },
    {
      classes: ["sx-col-flex-basis", "sx-col-flex-grow", "sx-col-max-width", "sx-col-width"],
      style: {
        "--sx-col-flex-basis": "auto",
        "--sx-col-flex-grow": "0",
        "--sx-col-max-width": "unset",
        "--sx-col-width": "auto",
      },
    },
  ],
  [
    "in a grid that grows, grows and takes up to the whole row",
    { grow: true },
    { span: 4 },
    {
      classes: ["sx-col-flex-basis", "sx-col-flex-grow", "sx-col-max-width"],
      style: {
        "--sx-col-flex-basis": basisOf("0.333333"),
        "--sx-col-flex-grow": "1",
        "--sx-col-max-width": "100%",
      },
    },
  ],
  [
    "gives offset, order and align to their variables, an offset of 0 as 0",
    {},
    { span: 6, offset: { base: 0, lg: 3 }, order: { base: 2, md: 1 }, align: "center" },
    {
      classes: [
        "sx-col-align-self",
        "sx-col-flex-basis",
        "sx-col-flex-grow",
        "sx-col-max-width",
        "sx-col-offset",
        "sx-col-offset-lg",
        "sx-col-order",
        "sx-col-order-md",
      ],
      style: {
        "--sx-col-align-self": "center",
        "--sx-col-flex-basis": basisOf("0.5"),
        "--sx-col-flex-grow": "0",
        "--sx-col-max-width": basisOf("0.5"),
        "--sx-col-offset": "0",
        "--sx-col-offset-lg": "calc((100% + var(--grid-column-gap)) * 0.25)",
        "--sx-col-order": "2",
        "--sx-col-order-md": "1",
      },
    },
  ],
];

test.each(columnCases)("GridCol: %s", (_, grid, column, expected) => {
  const { html, ...rendered } = columnIn(grid, column);

  expect(rendered).toEqual(expected);
  expect(html).not.toContain("solix-Grid-container");
});

test("GridCol: in a grid with container queries and breakpoints, keys its values by the grid's container widths, and renders its own rules", () => {
  const { html, classes } = columnIn(
    {
      type: "container",
      breakpoints: { xs: "10em", sm: "15em", md: "20em", lg: "25em", xl: "30em" },
    },
    { span: { base: 12, md: 6 } },
  );
  const [rules] = rulesOf(html);

  expect(classes).toContain("sx-col-flex-basis-c0-2");
  expect(rules).toContain("@container (min-width: 20em){");
  expect(
    [...rules.matchAll(/@property (--[\w-]+)/g)].map(([, property]) => property),
    "the column's rules hold only the pairs it places",
  ).toEqual(["--sx-col-flex-basis-c0-2", "--sx-col-flex-grow-c0-2", "--sx-col-max-width-c0-2"]);
  expect(rules).toContain(
    ".sx-col-flex-basis-c0-2{--col-flex-basis:var(--sx-col-flex-basis-c0-2)}",
  );
  expect(html).toContain("solix-Grid-container");
});

test("GridCol: in a grid with container queries and no breakpoints, keys its values by the library's breakpoint widths, applied to the grid's width", () => {
  const { html, classes } = columnIn({ type: "container" }, { span: { base: 12, md: 6 } });
  const [rules = ""] = rulesOf(html);

  expect(classes).toContain("sx-col-flex-basis-c0-2");
  expect(rules).toContain(`@container (min-width: ${mdInRem}){`);
  expect(rules).not.toContain("@media");
  expect(html).toContain("solix-Grid-container");
});

const mdFlexBasisRule = ".sx-col-flex-basis-c0-2{--col-flex-basis:var(--sx-col-flex-basis-c0-2)}";

test("in renderToString, each of the 12 columns of a container grid writes the rules it places, the ones it shares with the others among them", () => {
  const span = { base: 12, md: 6 };
  const html = renderToString(() =>
    createComponent(library.Grid, {
      type: "container",
      get children() {
        return [
          ...Array.from({ length: 11 }, () => createComponent(library.GridCol, { span })),
          createComponent(library.GridCol, { span, offset: { md: 1 } }),
        ];
      },
    }),
  );
  const rules = rulesOf(html);

  const offsetRule = ".sx-col-offset-c0-2{--col-offset:var(--sx-col-offset-c0-2)}";

  expect(rules).toHaveLength(12);
  expect(rules.every((written) => written.includes(mdFlexBasisRule))).toBe(true);
  expect(rules.filter((written) => written.includes(offsetRule))).toEqual(rules.slice(11));
});

test("a grid with container queries and no value keyed by a width renders its container part and no style element", () => {
  const simple = render("SimpleGrid", { type: "container", cols: 2, spacing: "md" });
  const grid = renderToString(() =>
    createComponent(library.Grid, {
      type: "container",
      breakpoints: { xs: "10em", sm: "15em", md: "20em", lg: "25em", xl: "30em" },
      get children() {
        return createComponent(library.GridCol, { span: 6 });
      },
    }),
  );

  expect(simple).toContain("solix-SimpleGrid-container");
  expect(grid).toContain("solix-Grid-container");
  expect(rulesOf(simple)).toEqual([]);
  expect(rulesOf(grid)).toEqual([]);
});

const widthCases = [
  ["30em", true],
  ["480px", true],
  ["2.5rem", true],
  [".5em", true],
  ["0em", true],
  ["2.05rem", true],
  ["0.001em", true],
  ["10.50em", true],
  ["-5em", false],
  ["-0em", false],
  ["+5em", false],
  ["5 em", false],
  [" 5em", false],
  ["5em ", false],
  ["0x10px", false],
  ["0b1px", false],
  ["1e2px", false],
  ["007px", false],
  ["5.em", false],
  ["1_0px", false],
  ["1.00001em", false],
  ["px", false],
  ["em", false],
  ["5", false],
  ["fivepx", false],
  ["Infinitypx", false],
  ["5pt", false],
] as const satisfies readonly (readonly [written: string, accepted: boolean])[];

type WidthCase = (typeof widthCases)[number];
type Written = WidthCase[0];
type AcceptedByTheType = {
  [Width in Written]: Width extends ContainerWidth ? Width : never;
}[Written];
type AcceptedByTheTable = Extract<WidthCase, readonly [string, true]>[0];

test("a container width is a non-negative decimal length with a unit and no space, and the type and the run time take the same ones", () => {
  const acceptedAtRunTime = widthCases.filter(([written]) =>
    builtQueryContainer.isContainerWidth(written),
  );

  expectTypeOf<AcceptedByTheType>().toEqualTypeOf<AcceptedByTheTable>();
  expect(acceptedAtRunTime).toEqual(widthCases.filter(([, accepted]) => accepted));
});

type Probe = { class?: string };
type TakenWithoutOptions<Of extends string | Variables> =
  [Of, Record<"root", CompiledStyles>, Probe] extends Parameters<
    typeof createParts<Of, Record<"root", CompiledStyles>, Probe, PartsOptions<Of, Probe>>
  >
    ? true
    : false;

test("createParts refuses, by type, a component's variables called without its options", () => {
  expectTypeOf<TakenWithoutOptions<"Center">>().toEqualTypeOf<true>();
  expectTypeOf<TakenWithoutOptions<typeof spaceVariables>>().toEqualTypeOf<false>();
});

test("a Grid with container queries and one with media queries, each with two like columns, render on the server, and each container column writes the rule they share", () => {
  const twoLikeColumns = (type: "container" | "media") =>
    createComponent(library.Grid, {
      type,
      get children() {
        return [
          createComponent(library.GridCol, { span: { base: 12, md: 6 }, children: "First" }),
          createComponent(library.GridCol, { span: { base: 12, md: 6 }, children: "Second" }),
        ];
      },
    });
  const container = renderToString(() => twoLikeColumns("container"));
  const media = renderToString(() => twoLikeColumns("media"));

  expect(container).toContain("Second");
  expect(rulesOf(container).join("").split(mdFlexBasisRule)).toHaveLength(3);
  expect(media).toContain("Second");
  expect(rulesOf(media)).toEqual([]);
});

test("in renderToString, a column after a column that waits inside Loading writes the rules they share, since the waiting column's rules are not in the markup", () => {
  const html = renderToString(() =>
    createComponent(library.Grid, {
      type: "container",
      get children() {
        return [
          createComponent(Loading, {
            fallback: "Waiting for a column",
            get children() {
              const span = createMemo(() => new Promise<number>(() => undefined));
              return createComponent(library.GridCol, {
                get span() {
                  return { base: 12, md: span() };
                },
                children: "Waiting",
              });
            },
          }),
          createComponent(library.GridCol, { span: { base: 12, md: 6 }, children: "After" }),
        ];
      },
    }),
  );

  expect(html).toContain("Waiting for a column");
  expect(html).toContain("After");
  expect(rulesOf(html).join("").split(mdFlexBasisRule)).toHaveLength(2);
});

function neverSettlingColumn(): ReturnType<typeof createComponent> {
  const text = createMemo(() => new Promise<string>(() => undefined));
  return createComponent(library.GridCol, {
    span: { base: 12, md: 6 },
    get children() {
      return text();
    },
  });
}

test("in renderToString, a column after a column with a synchronous span whose children wait inside Loading writes the rules they share", () => {
  const html = renderToString(() =>
    createComponent(library.Grid, {
      type: "container",
      get children() {
        return [
          createComponent(Loading, {
            fallback: "Waiting",
            get children() {
              return neverSettlingColumn();
            },
          }),
          createComponent(library.GridCol, { span: { base: 12, md: 6 }, children: "After" }),
        ];
      },
    }),
  );
  const waiting = html.indexOf("Waiting");
  const after = html.indexOf("After");

  expect(waiting).toBeGreaterThan(-1);
  expect(after).toBeGreaterThan(waiting);
  expect(rulesOf(html.slice(waiting, after)).join("")).toContain(mdFlexBasisRule);
});

test("in renderToString, a Grid.Col that is the fallback of a column waiting inside Loading writes its own rules", () => {
  const html = renderToString(() =>
    createComponent(library.Grid, {
      type: "container",
      get children() {
        return createComponent(Loading, {
          get fallback() {
            return createComponent(library.GridCol, {
              span: { base: 12, md: 6 },
              children: "Waiting",
            });
          },
          get children() {
            return neverSettlingColumn();
          },
        });
      },
    }),
  );
  const waiting = html.indexOf("Waiting");

  expect(waiting).toBeGreaterThan(-1);
  expect(rulesOf(html.slice(0, waiting)).join("")).toContain(mdFlexBasisRule);
});

function renderErroredContainerGrid(
  brokenColumn: () => ReturnType<typeof createComponent>,
): string {
  return expectingSolidDiagnostic("SSR_RENDER_ERROR_CONTAINED", () =>
    renderToString(() =>
      createComponent(library.Grid, {
        type: "container",
        get children() {
          return [
            createComponent(Errored, {
              fallback: () => "Fallback",
              get children() {
                return brokenColumn();
              },
            }),
            createComponent(library.GridCol, { span: { base: 12, md: 6 }, children: "Healthy" }),
          ];
        },
      }),
    ),
  );
}

test("a container Grid.Col whose children throw inside Errored leaves no stale entry to suppress a later healthy column's rules", () => {
  function Throws(): never {
    throw new Error("broken child");
  }
  const html = renderErroredContainerGrid(() =>
    createComponent(library.GridCol, {
      span: { base: 12, md: 6 },
      get children() {
        return createComponent(Throws, {});
      },
    }),
  );

  expect(html).toContain("Fallback");
  expect(html).toContain("Healthy");
  expect(rulesOf(html).join("")).toContain(mdFlexBasisRule);
});

test("a container Grid.Col whose span throws inside Errored neither leaks its error to a later sibling nor suppresses its rules", () => {
  const html = renderErroredContainerGrid(() =>
    createComponent(library.GridCol, {
      get span(): never {
        throw new Error("broken span");
      },
      children: "First",
    }),
  );

  expect(html).toContain("Fallback");
  expect(html).toContain("Healthy");
  expect(rulesOf(html).join("")).toContain(mdFlexBasisRule);
});

test("a signal written in a server render at the end of this file still raises SERVER_WRITE, so no render before it used up the one report Solid makes of it in this process", () => {
  expectingSolidDiagnostic("SERVER_WRITE", () =>
    renderToString(() => {
      const [, setWritten] = createSignal(false);
      setWritten(true);
      return "written";
    }),
  );
});
