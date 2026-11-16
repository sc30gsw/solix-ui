import { expect, test } from "vite-plus/test";
import { LIBRARY_CLASS_PREFIX } from "../build-pipeline.mjs";
import type {
  CenterProps,
  ContainerProps,
  FlexProps,
  GroupProps,
  SpaceProps,
  StackProps,
} from "../src/index";
import { render } from "./fixtures";
import {
  classesOf,
  declarationsIn,
  type Element,
  elementsOf,
  rootElementOf,
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
