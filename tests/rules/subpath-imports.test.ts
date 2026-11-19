import { mkdirSync, readFileSync, symlinkSync } from "node:fs";
import { createRequire } from "node:module";
import { join, relative } from "node:path";
import { expect, test } from "vite-plus/test";
import { manifestAt, manifestPaths } from "#/scripts/repository.ts";
import {
  filesTheRuleCovers,
  migrateToSubpathImports,
  misspelt,
  type ModuleReference,
  moduleReferences,
  unresolvedPaths,
} from "#/scripts/subpath-imports.ts";
import {
  insideOf,
  subpathPattern,
  subpathPatternTarget,
  subpathPrefix,
} from "#/scripts/subpath.ts";
import { inTemporaryTree, type Tree } from "#/tests/support/temporary-tree.ts";
import { repositoryRoot } from "#/tests/support/workspace.ts";

const codemod = "vp run migrate:subpath-imports";
const ruleFixtures = join(repositoryRoot, "tests/fixtures");
const outsideThePackage = "#outside/*";

function problems(references: readonly ModuleReference[], root: string): string[] {
  return misspelt(references, root).map(
    ({ file, line, statement, wanted }) =>
      `${relative(root, file)}:${line}: ${statement} reaches a file of its own package. Write "${wanted}", or run ${codemod}.`,
  );
}

function errorCodeOf(attempt: () => unknown): unknown {
  try {
    attempt();
    return undefined;
  } catch (error) {
    return (error as { code?: unknown }).code;
  }
}

test(`every package's manifest maps ${subpathPattern} to its root in "imports"`, () => {
  const paths = manifestPaths();
  const violations = paths.flatMap((path) => {
    const { imports } = manifestAt(path);
    return imports?.[subpathPattern] === subpathPatternTarget
      ? []
      : [
          `${path}: map "${subpathPattern}" to "${subpathPatternTarget}" in "imports". Run ${codemod}.`,
        ];
  });

  expect(paths.length).toBeGreaterThan(1);
  expect(violations).toEqual([]);
});

test(`every module specifier that reaches a file of its own package is ${subpathPrefix} and the file's path from the package root, whether it imports, exports, loads it later or names its type, and every path a specifier names outside the rule fixtures reaches a file`, () => {
  const references = moduleReferences(filesTheRuleCovers());

  expect(references.some(({ specifier }) => specifier.startsWith(subpathPrefix))).toBe(true);
  expect(problems(references, repositoryRoot)).toEqual([]);
  expect(
    unresolvedPaths(references)
      .filter(({ file }) => !insideOf(ruleFixtures, file))
      .map(
        ({ file, line, statement }) =>
          `${relative(repositoryRoot, file)}:${line}: ${statement} names a path that reaches no file.`,
      ),
  ).toEqual([]);
});

const probe: Tree = {
  "package.json": JSON.stringify({ name: "probe", type: "module" }),
  "src/a.ts": "export const a = 1;\nexport type A = number;\n",
  "src/nested/b.ts": [
    'import { a } from "../a.ts";',
    'import { a as extensionless } from "../a";',
    'import type { A } from "../a.ts";',
    'export { a as reexported } from "../a.ts";',
    'export * from "../a.ts";',
    'export const later = () => import("../a.ts");',
    'export type Typed = typeof import("../a.ts");',
    'import { inner } from "../../packages/inner/src/c.ts";',
    "export const named = `#/src/a.ts`;",
    "export { a, extensionless, inner, type A };",
    "",
  ].join("\n"),
  "src/required.cjs": 'const { a } = require("./a.ts");\nmodule.exports = { a };\n',
  "src/through-a-package.ts": 'export { inner } from "inner";\n',
  "packages/inner/package.json": JSON.stringify({
    name: "inner",
    type: "module",
    exports: "./src/c.ts",
  }),
  "packages/inner/src/c.ts": 'import { a } from "../../../src/a.ts";\nexport const inner = a;\n',
};

test(`the rule flags every way a file can reach a file of its own package without ${subpathPrefix}, leaves a file outside the package and a package's name alone, and the codemod rewrites each to a specifier that reaches the same file`, async () => {
  await inTemporaryTree(probe, (root) => {
    mkdirSync(join(root, "node_modules"));
    symlinkSync(join(root, "packages/inner"), join(root, "node_modules/inner"), "dir");
    const before = moduleReferences(filesTheRuleCovers(root));
    const flagged = misspelt(before, root).map(
      ({ file, line, wanted }) => `${relative(root, file)}:${line} ${wanted}`,
    );

    expect(flagged.toSorted()).toEqual([
      "src/nested/b.ts:1 #/src/a.ts",
      "src/nested/b.ts:2 #/src/a.ts",
      "src/nested/b.ts:3 #/src/a.ts",
      "src/nested/b.ts:4 #/src/a.ts",
      "src/nested/b.ts:5 #/src/a.ts",
      "src/nested/b.ts:6 #/src/a.ts",
      "src/nested/b.ts:7 #/src/a.ts",
      "src/nested/b.ts:8 #/packages/inner/src/c.ts",
      "src/required.cjs:1 #/src/a.ts",
    ]);

    const migrated = migrateToSubpathImports(root);
    const changed = migrated.map((file) => relative(root, file));
    const after = moduleReferences(filesTheRuleCovers(root));
    const reachedAt = (references: readonly ModuleReference[]) =>
      references.map(({ file, line, reached }) => `${relative(root, file)}:${line} ${reached}`);

    expect(changed.toSorted()).toEqual([
      "package.json",
      "packages/inner/package.json",
      "src/nested/b.ts",
      "src/required.cjs",
    ]);
    expect(problems(after, root)).toEqual([]);
    expect(reachedAt(after)).toEqual(reachedAt(before));
    expect(reachedAt(before)).toContain(
      `src/through-a-package.ts:1 ${join(root, "packages/inner/src/c.ts")}`,
    );
    expect(readFileSync(join(root, "packages/inner/src/c.ts"), "utf8")).toBe(
      probe["packages/inner/src/c.ts"],
    );
    expect(migrateToSubpathImports(root)).toEqual([]);
  });
});

test(`a file outside its package keeps its relative specifier, because Node refuses an "imports" target that leaves the package`, async () => {
  await inTemporaryTree(
    {
      "package.json": JSON.stringify({ name: "outer", type: "module" }),
      "src/a.ts": "export const a = 1;\n",
      "packages/inner/package.json": JSON.stringify({
        name: "inner",
        type: "module",
        imports: { [subpathPattern]: subpathPatternTarget, [outsideThePackage]: "../../*" },
      }),
      "packages/inner/src/c.ts": "export const c = 1;\n",
    },
    (root) => {
      const resolveFrom = createRequire(join(root, "packages/inner/src/c.ts")).resolve;

      expect(resolveFrom(`${subpathPrefix}src/c.ts`)).toBe(join(root, "packages/inner/src/c.ts"));
      expect(errorCodeOf(() => resolveFrom(outsideThePackage.replace("*", "src/a.ts")))).toBe(
        "ERR_INVALID_PACKAGE_TARGET",
      );
    },
  );
});
