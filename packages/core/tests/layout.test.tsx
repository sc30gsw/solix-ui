import type { CompiledStyles } from "@stylexjs/stylex";
import { createComponent, renderToString } from "@solidjs/web";
import { expect, expectTypeOf, test } from "vite-plus/test";
import { LIBRARY_CLASS_PREFIX } from "../build-pipeline.mjs";
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
} from "../src/index";
import type { createParts } from "../src/parts";
import type { ContainerWidth } from "../src/style-props";
import { isContainerWidth, library } from "./built-library";
import { render } from "./fixtures";
import {
  classesOf,
  declarationsIn,
  type Element,
  elementCarrying,
  elementsOf,
  rootElementOf,
  rulesOf,
  valuesOf,
} from "./markup";

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
    "mih replaces h as the minimum height",
    { h: "xl", mih: "xs" },
    {
      classes: ["sx-h", "sx-mih", "sx-space-min-height"],
      style: {
        "--sx-h": "var(--solix-spacing-xl)",
        "--sx-mih": "var(--solix-spacing-xs)",
        "--sx-space-min-height": "var(--solix-spacing-xs)",
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
    "it leaves out every falsy child",
  ).toEqual(["span", "span", "i"]);
  expect(html, "it renders no text for a falsy child").not.toMatch(/>0<|>false<|>true</);
  expect(elementsOf(html)).toHaveLength(children + 1);
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

test("SimpleGrid's type refuses a container width key with media queries and a breakpoint key with container queries, and Grid's refuses breakpoints that are not container widths", () => {
  expectTypeOf<{ type: "media"; cols: { "40em": number } }>().not.toExtend<SimpleGridProps>();
  expectTypeOf<{ type: "container"; cols: { md: number } }>().not.toExtend<SimpleGridProps>();
  expectTypeOf<{ type: "container"; cols: { "40em": number } }>().toExtend<SimpleGridProps>();
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
  [
    "in a grid with container queries and no breakpoints, keeps only its base values",
    { type: "container" },
    { span: { base: 12, md: 6 } },
    {
      classes: ["sx-col-flex-basis", "sx-col-flex-grow", "sx-col-max-width"],
      style: {
        "--sx-col-flex-basis": basisOf("1"),
        "--sx-col-flex-grow": "0",
        "--sx-col-max-width": basisOf("1"),
      },
    },
  ],
];

test.each(columnCases)("GridCol: %s", (_, grid, column, expected) => {
  const { html, ...rendered } = columnIn(grid, column);

  expect(rendered).toEqual(expected);
  expect(html).not.toContain("solix-Grid-container");
});

test("GridCol: in a grid with container queries and breakpoints, keys its values by the grid's container widths, whose rules the grid renders", () => {
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
    "the grid's rules hold only the pairs its columns use",
  ).toEqual(["--sx-col-flex-basis-c0-2", "--sx-col-flex-grow-c0-2", "--sx-col-max-width-c0-2"]);
  expect(rules).toContain(
    ".sx-col-flex-basis-c0-2{--col-flex-basis:var(--sx-col-flex-basis-c0-2)}",
  );
  expect(html).toContain("solix-Grid-container");
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

const writtenWidths = [
  "30em",
  "480px",
  "2.5rem",
  ".5em",
  "1e2px",
  "-5em",
  "0x10px",
  "px",
  "em",
  "5",
  "5 em",
  "fivepx",
  "Infinitypx",
  "5pt",
] as const;

type Written = (typeof writtenWidths)[number];
type AcceptedByTheType = {
  [Width in Written]: Width extends ContainerWidth ? Width : never;
}[Written];

test("a container width the type takes is one the run time takes, and the other way round", () => {
  const acceptedAtRunTime = writtenWidths.filter((width) => isContainerWidth(width));

  expectTypeOf<AcceptedByTheType>().toEqualTypeOf<
    "30em" | "480px" | "2.5rem" | ".5em" | "1e2px" | "-5em" | "0x10px" | "5 em"
  >();
  expect(acceptedAtRunTime).toEqual([
    "30em",
    "480px",
    "2.5rem",
    ".5em",
    "1e2px",
    "-5em",
    "0x10px",
    "5 em",
  ]);
});

type NameTakenWithoutOptions<Name extends string> = Parameters<
  typeof createParts<Name, Record<"root", CompiledStyles>, { class?: string }>
>[0];

test("createParts refuses, by type, a variable group's name called without its options", () => {
  expectTypeOf<NameTakenWithoutOptions<"Center">>().toEqualTypeOf<"Center">();
  expectTypeOf<NameTakenWithoutOptions<"Space">>().toBeNever();
});
