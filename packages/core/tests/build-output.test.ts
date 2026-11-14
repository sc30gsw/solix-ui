import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import postcss from "postcss";
import { expect, test } from "vite-plus/test";
import { LIBRARY_CASCADE_LAYER, LIBRARY_CLASS_PREFIX } from "../build-pipeline.mjs";
import { builtComponents } from "./built-components";

const dist = join(import.meta.dirname, "../dist");
const stylesheet = readFileSync(join(dist, "styles.css"), "utf8").trim();

function depthAfterEachCharacter(css: string): number[] {
  let depth = 0;
  return css.split("").map((character) => {
    if (character === "{") depth += 1;
    if (character === "}") depth -= 1;
    return depth;
  });
}

test("every rule sits inside the one library cascade layer", () => {
  expect(stylesheet.startsWith(`@layer ${LIBRARY_CASCADE_LAYER} {`)).toBe(true);

  const depths = depthAfterEachCharacter(stylesheet);
  const firstBrace = stylesheet.indexOf("{");
  const positionsBackAtTopLevel = depths
    .map((depth, position) => (position >= firstBrace && depth === 0 ? position : -1))
    .filter((position) => position !== -1);

  expect(positionsBackAtTopLevel).toEqual([stylesheet.length - 1]);
});

test("every class name carries the library's own prefix", () => {
  const classNames = stylesheet.match(/\.[A-Za-z_][\w-]*/g) ?? [];

  const stylexDefaultPrefix = "x";

  expect(LIBRARY_CLASS_PREFIX).not.toBe(stylexDefaultPrefix);
  expect(classNames.length).toBeGreaterThan(0);
  expect(classNames.filter((name) => !name.startsWith(`.${LIBRARY_CLASS_PREFIX}`))).toEqual([]);
});

test("no declaration is marked important, so nothing in the layer can outrank a consumer", () => {
  const important: string[] = [];
  postcss.parse(stylesheet).walkDecls((declaration) => {
    if (declaration.important) important.push(`${declaration.prop}: ${declaration.value}`);
  });

  expect(important).toEqual([]);
});

test("a token keeps its public custom property name", () => {
  expect(stylesheet).toContain("--solix-color-primary:");
  expect(readFileSync(join(dist, "tokens.stylex.js"), "utf8")).toContain(
    "var(--solix-color-primary)",
  );
});

test("open state compiles to a selector on the element's own open attribute", () => {
  expect(stylesheet).toMatch(new RegExp(`\\.${LIBRARY_CLASS_PREFIX}\\w+\\[open\\]\\{`));
  expect(stylesheet).not.toMatch(/\[open\] \*/);
});

test.each(builtComponents)(
  "%s ships as JSX source with its styles compiled to class names",
  (name) => {
    const file = join(dist, `${name}.jsx`);
    const where = `packages/core/dist/${name}.jsx`;

    expect(existsSync(file), `${where}: build the library so the component ships`).toBe(true);
    const source = readFileSync(file, "utf8");
    expect(source, `${where}: compile stylex.create away in the build`).not.toContain(
      "stylex.create",
    );
    expect(source, `${where}: compile stylex.attrs away in the build`).not.toContain(
      "stylex.attrs",
    );
    expect(source, `${where}: keep the stable class on the root`).toContain(`solix-${name}-root`);
  },
);

test("input validity and the modal backdrop compile to the platform's own selectors", () => {
  expect(stylesheet).toMatch(new RegExp(`\\.${LIBRARY_CLASS_PREFIX}\\w+:user-invalid\\{`));
  expect(stylesheet).toMatch(new RegExp(`\\.${LIBRARY_CLASS_PREFIX}\\w+::backdrop\\{`));
});
