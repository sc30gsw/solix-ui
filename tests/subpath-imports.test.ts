import { transformAsync } from "@babel/core";
import presetTypescript from "@babel/preset-typescript";
import fc from "fast-check";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { expect, test } from "vite-plus/test";
import {
  distSpecifier,
  distSpecifiers,
  outputPathOf,
  type SourceLayout,
  subpathPrefix,
} from "#/scripts/dist-specifiers.ts";
import { manifestPaths } from "#/scripts/repository.ts";
import {
  filesTheRuleCovers,
  migrateToSubpathImports,
  misspelt,
  type ModuleReference,
  moduleReferences,
  subpathImports,
} from "#/scripts/subpath-imports.ts";
import { descendants, moduleSpecifierOf, parseText, rereadFiles, ts } from "#/scripts/syntax.ts";
import { repositoryRoot } from "#/tests/support/workspace.ts";

const codemod = "vp run migrate:subpath-imports";
const outsideThePackage = "#outside/*";
const generatedLayouts = 50;

type Tree = Record<string, string>;

async function inTemporaryDirectory<T>(
  tree: Tree,
  use: (root: string) => T | Promise<T>,
): Promise<T> {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "subpath-imports-")));
  try {
    for (const [path, text] of Object.entries(tree)) {
      mkdirSync(dirname(join(root, path)), { recursive: true });
      writeFileSync(join(root, path), text);
    }
    return await use(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

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

test(`every package's manifest maps ${Object.keys(subpathImports).join(", ")} to its root in "imports"`, () => {
  const paths = manifestPaths();
  const violations = paths.flatMap((path) => {
    const { imports } = JSON.parse(readFileSync(join(repositoryRoot, path), "utf8")) as {
      imports?: Record<string, string>;
    };
    return Object.entries(subpathImports)
      .filter(([key, target]) => imports?.[key] !== target)
      .map(([key, target]) => `${path}: map "${key}" to "${target}" in "imports". Run ${codemod}.`);
  });

  expect(paths.length).toBeGreaterThan(1);
  expect(violations).toEqual([]);
});

test(`every module specifier that reaches a file of its own package is ${subpathPrefix} and the file's path from the package root, whether it imports, exports, loads it later or names its type`, () => {
  const references = moduleReferences(filesTheRuleCovers());

  expect(references.some(({ specifier }) => specifier.startsWith(subpathPrefix))).toBe(true);
  expect(problems(references, repositoryRoot)).toEqual([]);
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
  await inTemporaryDirectory(probe, (root) => {
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
    rereadFiles(migrated);
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
  await inTemporaryDirectory(
    {
      "package.json": JSON.stringify({ name: "outer", type: "module" }),
      "src/a.ts": "export const a = 1;\n",
      "packages/inner/package.json": JSON.stringify({
        name: "inner",
        type: "module",
        imports: { ...subpathImports, [outsideThePackage]: "../../*" },
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

const segment = fc.constantFrom("a", "b", "c");
const outputExtensions = fc.constantFrom<Readonly<Record<string, string>>>(
  { ".ts": ".js" },
  { ".ts": ".js", ".tsx": ".jsx" },
  { ".mts": ".mjs", ".ts": ".js", ".tsx": ".jsx" },
);
const loadKinds = ["import", "export-all", "export-named", "dynamic"] as const;

type Load = { target: number; kind: (typeof loadKinds)[number] };

function statementFor({ kind }: Load, specifier: string, index: number): string {
  switch (kind) {
    case "import":
      return `import "${specifier}";`;
    case "export-all":
      return `export * from "${specifier}";`;
    case "export-named":
      return `export { marker as marker${index} } from "${specifier}";`;
    case "dynamic":
      return `export const load${index} = () => import("${specifier}");`;
    default: {
      const unhandled: never = kind;
      throw new Error(`No statement loads a module as ${String(unhandled)}.`);
    }
  }
}

function specifiersIn(code: string): string[] {
  return descendants(parseText(code, ".js")).flatMap((node) => {
    const specifier = moduleSpecifierOf(node);
    return specifier && ts.isStringLiteralLikeNode(specifier) ? [specifier.text] : [];
  });
}

const generatedPackage = outputExtensions.chain((extensions) =>
  fc.record({
    extensions: fc.constant(extensions),
    sourceDirectory: fc
      .array(segment, { minLength: 1, maxLength: 2 })
      .map((parts) => parts.join("/")),
    files: fc.uniqueArray(
      fc
        .record({
          directories: fc.array(segment, { maxLength: 3 }),
          name: fc.constantFrom("x", "y", "z"),
          extension: fc.constantFrom(...Object.keys(extensions)),
        })
        .map(({ directories, name, extension }) =>
          [...directories, `${name}${extension}`].join("/"),
        ),
      { minLength: 1, maxLength: 6 },
    ),
    loads: fc.array(
      fc.array(fc.record({ target: fc.nat(), kind: fc.constantFrom(...loadKinds) }), {
        maxLength: 4,
      }),
      { minLength: 6, maxLength: 6 },
    ),
  }),
);

test(`for generated layouts, the build rewrites every ${subpathPrefix} specifier in dist to a relative one that reaches the output of the file the original reached`, async () => {
  await fc.assert(
    fc.asyncProperty(generatedPackage, async ({ extensions, sourceDirectory, files, loads }) => {
      const sources = files.map((file, index) => {
        const statements = loads[index].map((load, at) =>
          statementFor(
            load,
            `${subpathPrefix}${sourceDirectory}/${files[load.target % files.length]}`,
            at,
          ),
        );
        return [
          `${sourceDirectory}/${file}`,
          [...statements, "export const marker = 1;", ""].join("\n"),
        ];
      });
      await inTemporaryDirectory(
        {
          "package.json": JSON.stringify({
            name: "generated",
            type: "module",
            imports: subpathImports,
          }),
          ...Object.fromEntries(sources),
        },
        async (root) => {
          const layout: SourceLayout = {
            packageRoot: root,
            sourceDirectory: join(root, sourceDirectory),
            outputExtensions: extensions,
          };
          const outputOf = (file: string) =>
            join(root, "dist", relative(layout.sourceDirectory, outputPathOf(file, layout)));
          for (const [path, text] of sources) {
            const filename = join(root, path);
            const output = await transformAsync(text, {
              filename,
              babelrc: false,
              configFile: false,
              presets: [presetTypescript],
              plugins: [distSpecifiers(layout)],
            });
            mkdirSync(dirname(outputOf(filename)), { recursive: true });
            writeFileSync(outputOf(filename), output?.code ?? "");
          }
          for (const [path, text] of sources) {
            const filename = join(root, path);
            const originals = specifiersIn(text);
            const rewritten = specifiersIn(readFileSync(outputOf(filename), "utf8"));
            const fromSource = createRequire(filename).resolve;
            const fromOutput = createRequire(outputOf(filename)).resolve;

            expect(rewritten.length).toBe(originals.length);
            expect(rewritten.map((specifier) => fromOutput(specifier))).toEqual(
              originals.map((specifier) => outputOf(fromSource(specifier))),
            );
          }
        },
      );
    }),
    { numRuns: generatedLayouts },
  );
});

test(`the build refuses a relative specifier, and a ${subpathPrefix} specifier that reaches a file outside the sources it compiles, since dist would hold no file for it`, () => {
  const packageRoot = join(tmpdir(), "refused");
  const layout: SourceLayout = {
    packageRoot,
    sourceDirectory: join(packageRoot, "src"),
    outputExtensions: { ".ts": ".js" },
  };
  const importer = join(packageRoot, "src/a.ts");

  expect(distSpecifier(`${subpathPrefix}src/b.ts`, importer, layout)).toBe("./b.js");
  expect(() => distSpecifier(`${subpathPrefix}build.ts`, importer, layout)).toThrow(/outside src/);
  expect(() => distSpecifier("./b.ts", importer, layout)).toThrow(/is relative/);
  expect(() => distSpecifier("../src/b.ts", importer, layout)).toThrow(/is relative/);
  expect(() => distSpecifier(`${subpathPrefix}src/style.css`, importer, layout)).toThrow(
    /no output for a \.css file/,
  );
});
