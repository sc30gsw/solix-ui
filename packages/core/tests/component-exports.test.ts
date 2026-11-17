import { expect, test } from "vite-plus/test";
import { builtComponents, componentExports, library } from "#/tests/built-library.ts";

test("the components the library exports are the exports whose call signatures the type checker gives the JSX element type as return type: every built component and the provider, and no other export", () => {
  const components = componentExports();

  expect(components).toEqual(expect.arrayContaining(builtComponents));
  expect(components).toContain(library.SolixProvider.name);
  expect(components).not.toContain(library.createTheme.name);
});
