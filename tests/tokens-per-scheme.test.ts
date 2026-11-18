import { expect, test } from "vite-plus/test";
import { tokensPerScheme } from "#/scripts/tokens-per-scheme.ts";

const refused: [why: string, css: string][] = [
  ["two of them in one value", ":root{--a:light-dark(red, blue) x light-dark(green)}"],
  ["an empty dark value", ":root{--a:light-dark(red, )}"],
  ["one value", ":root{--a:light-dark(red)}"],
  ["three values", ":root{--a:light-dark(red, blue, green)}"],
  ["a value beside it", ":root{--a:0 0 0 1px light-dark(red, blue)}"],
  ["another function around it", ":root{--a:color-mix(in oklch, light-dark(red, blue), white)}"],
  ["upper case beside a value", ":root{--a:1px LIGHT-DARK(red, blue)}"],
  ["a condition around its rule", "@media screen{:root{--a:light-dark(red, blue)}}"],
  ["!important", ":root{--a:light-dark(red, blue) !important}"],
  ["a second declaration", ":root{--a:light-dark(red, blue)}:root{--a:light-dark(green, blue)}"],
  ["a class on the root", ":root.x{--a:light-dark(red, blue)}"],
  ["an element type for the root", "html{--a:light-dark(red, blue)}"],
  ["a class alone", ".x{--a:light-dark(red, blue)}"],
  ["a property that is no custom property", ":root{a:light-dark(red, blue)}"],
];

test.each(refused)(
  "the build refuses light-dark() with %s, naming the token, and leaves none behind in any letter case",
  (_, css) => {
    expect(() => tokensPerScheme(css, "light")).toThrow(/^(?:--)?a: /);
  },
);

test("the build gives each scheme the value a custom property on :root names for it in one light-dark(), in any letter case and inside any layer, and leaves the default scheme's value in its place", () => {
  const css =
    "@layer a{:root, .x{--a:light-dark(oklch(1 0 0), oklch(0.2 0.03 268 / 0.5));--b:1rem}}:root{--c: LIGHT-DARK( red ,  blue )}.y{color:var(--a)}";
  const tokens = {
    light: [
      ["--a", "oklch(1 0 0)"],
      ["--c", "red"],
    ],
    dark: [
      ["--a", "oklch(0.2 0.03 268 / 0.5)"],
      ["--c", "blue"],
    ],
  };

  expect(tokensPerScheme(css, "light")).toEqual({
    css: "@layer a{:root, .x{--a:oklch(1 0 0);--b:1rem}}:root{--c: red}.y{color:var(--a)}",
    tokens,
  });
  expect(tokensPerScheme(css, "dark")).toEqual({
    css: "@layer a{:root, .x{--a:oklch(0.2 0.03 268 / 0.5);--b:1rem}}:root{--c: blue}.y{color:var(--a)}",
    tokens,
  });
});
