import { expect, test } from "vite-plus/test";
import { LIBRARY_CLASS_PREFIX } from "../build-pipeline.mjs";
import type { BoxProps } from "../src/index";
import { render } from "./fixtures";
import { classesOf, declarationsIn, rootElementOf, valuesOf } from "./markup";

const resolvedCases: [
  what: string,
  props: BoxProps,
  classes: string[],
  style: Record<string, string>,
][] = [
  ["a number is pixels, written in rem", { mt: 16 }, ["sx-mt"], { "--sx-mt": "1rem" }],
  [
    "a colour scale key reads its token",
    { bg: "error" },
    ["sx-bg"],
    { "--sx-bg": "var(--solix-color-error)" },
  ],
  ["a CSS-wide keyword passes through", { c: "inherit" }, ["sx-c"], { "--sx-c": "inherit" }],
  [
    "a number for a property that is not a length stays a number",
    { opacity: 0.5 },
    ["sx-opacity"],
    { "--sx-opacity": "0.5" },
  ],
  [
    "a responsive value sets its base and each breakpoint it names",
    { p: { base: "xs", md: "lg" } },
    ["sx-p", "sx-p-md"],
    {
      "--sx-p": "var(--solix-spacing-xs)",
      "--sx-p-md": "var(--solix-spacing-lg)",
    },
  ],
  [
    "an alias sets the class and property of the prop it aliases",
    { mis: 8 },
    ["sx-ms"],
    { "--sx-ms": "0.5rem" },
  ],
  ["hiddenFrom adds its class and no property", { hiddenFrom: "md" }, ["sx-hidden-from-md"], {}],
  [
    "null is the same as leaving the prop out",
    { mt: null, p: { base: null, md: 4 }, hiddenFrom: null },
    ["sx-p-md"],
    { "--sx-p-md": "0.25rem" },
  ],
  ["a value that holds a semicolon is dropped", { c: "red; background: blue" }, [], {}],
  [
    "a value that holds a brace is dropped at its own breakpoint only",
    { m: { base: "1px}", md: "{", lg: 4 } },
    ["sx-m-lg"],
    { "--sx-m-lg": "0.25rem" },
  ],
];

test.each(resolvedCases)("Box: %s", (_, props, expectedClasses, expectedStyle) => {
  const root = rootElementOf(render("Box", props));

  expect(
    classesOf(root)
      .filter((found) => found.startsWith(`${LIBRARY_CLASS_PREFIX}-`))
      .sort(),
  ).toEqual([...expectedClasses].sort());
  expect(Object.fromEntries(declarationsIn(valuesOf(root, "style")[0]))).toEqual(expectedStyle);
});
