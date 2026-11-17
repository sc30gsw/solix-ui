import { expect, test } from "vite-plus/test";
import { builtComponents, componentExports, library } from "#/tests/built-library.ts";

const builtByName: Record<string, unknown> = library;

test("the components the library exports are the exports whose call signatures the type checker gives the JSX element type as return type: every built component and the provider, and no other export", () => {
  expect(new Set(componentExports().map((name) => builtByName[name]))).toEqual(
    new Set([...builtComponents.map((name) => builtByName[name]), library.SolixProvider]),
  );
});
