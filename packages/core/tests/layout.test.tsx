import { expect, test } from "vite-plus/test";
import { LIBRARY_CLASS_PREFIX } from "../build-pipeline.mjs";
import type { SpaceProps } from "../src/index";
import { render } from "./fixtures";
import { classesOf, declarationsIn, rootElementOf, valuesOf } from "./markup";

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
