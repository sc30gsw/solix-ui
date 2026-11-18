import { transformAsync } from "@babel/core";
import presetTypescript from "@babel/preset-typescript";
import fc from "fast-check";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { expect, test } from "vite-plus/test";
import {
  buildSources,
  distSpecifier,
  distSpecifiers,
  outputPathOf,
  type SourceLayout,
} from "../../../scripts/dist-specifiers.ts";
import { subpathPattern, subpathPatternTarget, subpathPrefix } from "../../../scripts/subpath.ts";
import { descendants, moduleSpecifierOf, parseText, ts } from "../../../scripts/syntax.ts";
import { inTemporaryTree } from "../../../tests/support/temporary-tree.ts";
import { assertProperty } from "../../../tests/support/properties.ts";

const generatedLayouts = 50;
const manifest = JSON.stringify({
  name: "generated",
  type: "module",
  imports: { [subpathPattern]: subpathPatternTarget },
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

const directory = fc.array(segment, { minLength: 1, maxLength: 2 }).map((parts) => parts.join("/"));

const generatedPackage = outputExtensions.chain((extensions) =>
  fc.record({
    extensions: fc.constant(extensions),
    sourceDirectory: directory,
    outputDirectory: directory.map((path) => `out/${path}`),
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

test(`for generated layouts, the build rewrites every ${subpathPrefix} specifier in dist to a relative one that reaches the output of the file the original reached`, async (context) => {
  await assertProperty(
    context,
    fc.asyncProperty(generatedPackage, async (generated) => {
      const { extensions, sourceDirectory, outputDirectory, files, loads } = generated;
      const sources = files.map((file, index): [string, string] => {
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
      await inTemporaryTree(
        { "package.json": manifest, ...Object.fromEntries(sources) },
        async (root) => {
          const layout: SourceLayout = {
            packageRoot: root,
            sourceDirectory: join(root, sourceDirectory),
            outputDirectory: join(root, outputDirectory),
            outputExtensions: extensions,
          };
          await buildSources(
            layout,
            async (filename, source) =>
              (
                await transformAsync(source, {
                  filename,
                  babelrc: false,
                  configFile: false,
                  presets: [presetTypescript],
                  plugins: [distSpecifiers(layout)],
                })
              )?.code ?? "",
            () => {},
          );
          for (const [path, text] of sources) {
            const filename = join(root, path);
            const output = outputPathOf(filename, layout);
            const originals = specifiersIn(text);
            const rewritten = specifiersIn(readFileSync(output, "utf8"));
            const fromSource = createRequire(filename).resolve;
            const fromOutput = createRequire(output).resolve;

            expect(rewritten.length).toBe(originals.length);
            expect(rewritten.map((specifier) => fromOutput(specifier))).toEqual(
              originals.map((specifier) => outputPathOf(fromSource(specifier), layout)),
            );
          }
        },
      );
    }),
    { numRuns: generatedLayouts },
  );
});

test(`the build refuses a relative specifier, and a ${subpathPrefix} specifier that reaches a file outside the sources it compiles, since dist would hold no file for it`, async () => {
  await inTemporaryTree({ "package.json": manifest }, (root) => {
    const layout: SourceLayout = {
      packageRoot: root,
      sourceDirectory: join(root, "src"),
      outputDirectory: join(root, "dist"),
      outputExtensions: { ".ts": ".js" },
    };
    const importer = join(root, "src/a.ts");

    expect(distSpecifier(`${subpathPrefix}src/b.ts`, importer, layout)).toBe("./b.js");
    expect(distSpecifier(`${subpathPrefix}src/c/d.ts`, importer, layout)).toBe("./c/d.js");
    expect(() => distSpecifier(`${subpathPrefix}build.ts`, importer, layout)).toThrow(
      /outside src/,
    );
    expect(() => distSpecifier("./b.ts", importer, layout)).toThrow(/is relative/);
    expect(() => distSpecifier("../src/b.ts", importer, layout)).toThrow(/is relative/);
    expect(() => distSpecifier("#internal/b.ts", importer, layout)).toThrow(/neither a package/);
    expect(distSpecifier("solid-js", importer, layout)).toBe("solid-js");
    expect(distSpecifier("node:fs", importer, layout)).toBe("node:fs");
    expect(() => distSpecifier(`${subpathPrefix}src/style.css`, importer, layout)).toThrow(
      /no output for a \.css file/,
    );
  });
});
