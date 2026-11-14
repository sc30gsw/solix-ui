import { renderToString, type ValidComponent } from "@solidjs/web";
import { expect, expectTypeOf, test } from "vite-plus/test";
import { LIBRARY_CLASS_PREFIX } from "../build-pipeline.mjs";
import type * as Library from "../src/index";
import { elsewhere, own } from "./arbitraries";
import { library, renderBuilt } from "./built-library";
import { classesOf, declarationsIn, rootElementOf, valuesOf } from "./markup";

type BoxPropsFor<T extends ValidComponent> = Parameters<typeof Library.Box<T>>[0];

const resolvedCases: [
  what: string,
  props: BoxPropsFor<"div">,
  classes: string[],
  style: Record<string, string>,
][] = [
  ["a number is pixels, written in rem", { mt: 16 }, [own("mt")], { [`--${own("mt")}`]: "1rem" }],
  [
    "a colour scale key reads its token",
    { bg: "error" },
    [own("bg")],
    { [`--${own("bg")}`]: "var(--solix-color-error)" },
  ],
  [
    "a CSS-wide keyword passes through",
    { c: "inherit" },
    [own("c")],
    { [`--${own("c")}`]: "inherit" },
  ],
  [
    "a number for a property that is not a length stays a number",
    { opacity: 0.5 },
    [own("opacity")],
    { [`--${own("opacity")}`]: "0.5" },
  ],
  [
    "a responsive value sets its base and each breakpoint it names",
    { p: { base: "xs", md: "lg" } },
    [own("p"), own("p-md")],
    {
      [`--${own("p")}`]: "var(--solix-spacing-xs)",
      [`--${own("p-md")}`]: "var(--solix-spacing-lg)",
    },
  ],
  [
    "an alias sets the class and property of the prop it aliases",
    { mis: 8 },
    [own("ms")],
    { [`--${own("ms")}`]: "0.5rem" },
  ],
  ["hiddenFrom adds its class and no property", { hiddenFrom: "md" }, [own("hidden-from-md")], {}],
  [
    "null is the same as leaving the prop out",
    { mt: null, p: { base: null, md: 4 }, hiddenFrom: null },
    [own("p-md")],
    { [`--${own("p-md")}`]: "0.25rem" },
  ],
  ["a value that holds a semicolon is dropped", { c: "red; background: blue" }, [], {}],
  [
    "a value that holds a brace is dropped at its own breakpoint only",
    { m: { base: "1px}", md: "{", lg: 4 } },
    [own("m-lg")],
    { [`--${own("m-lg")}`]: "0.25rem" },
  ],
];

test.each(resolvedCases)("Box: %s", (_, props, expectedClasses, expectedStyle) => {
  const root = rootElementOf(renderBuilt("Box", { children: "Content", ...props }));

  expect(
    classesOf(root)
      .filter((found) => found.startsWith(`${LIBRARY_CLASS_PREFIX}-`))
      .sort(),
  ).toEqual([...expectedClasses].sort());
  expect(Object.fromEntries(declarationsIn(valuesOf(root, "style")[0]))).toEqual(expectedStyle);
});

test("Box takes the attributes of the element its component prop names, and renders that element", () => {
  expectTypeOf<"href">().toExtend<keyof BoxPropsFor<"a">>();
  expectTypeOf<"href">().not.toExtend<keyof BoxPropsFor<"div">>();

  const html = renderToString(() => (
    <library.Box component="a" href={elsewhere}>
      Link
    </library.Box>
  ));

  expect(rootElementOf(html).tag).toBe("a");
  expect(rootElementOf(html).attributes).toContainEqual(["href", elsewhere]);
});
