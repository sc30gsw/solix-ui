import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, extname, join, relative } from "node:path";
import {
  insideOf,
  isRelative,
  namesAPackage,
  posix,
  subpathPrefix,
  subpathTarget,
} from "#/scripts/subpath.ts";

export type SourceLayout = {
  packageRoot: string;
  sourceDirectory: string;
  outputDirectory: string;
  outputExtensions: Readonly<Record<string, string>>;
};

type Literal = { type: string; value?: unknown };
type NodePath = { node: { source?: Literal | null } };
type ProgramPath = {
  traverse: (
    visitor: Record<string, (path: NodePath, state: PluginState) => void>,
    state: PluginState,
  ) => void;
};
type PluginState = { filename?: string };

export function libraryLayout(
  packageRoot: string,
  outputExtensions: Readonly<Record<string, string>>,
): SourceLayout {
  return {
    packageRoot,
    sourceDirectory: join(packageRoot, "src"),
    outputDirectory: join(packageRoot, "dist"),
    outputExtensions,
  };
}

export function outputPathOf(file: string, layout: SourceLayout): string {
  const extension = extname(file);
  const output = layout.outputExtensions[extension];
  if (output === undefined) {
    throw new Error(
      `${file}: the build writes no output for a ${extension || "extensionless"} file; it compiles ${Object.keys(layout.outputExtensions).join(", ")}.`,
    );
  }
  const fromSources = relative(layout.sourceDirectory, file);
  return join(layout.outputDirectory, `${fromSources.slice(0, -extension.length)}${output}`);
}

export function distSpecifier(specifier: string, importer: string, layout: SourceLayout): string {
  if (isRelative(specifier)) {
    throw new Error(
      `${importer}: ${specifier} is relative. Name a file of this package with ${subpathPrefix} and its path from the package root, or run vp run migrate:subpath-imports.`,
    );
  }
  if (namesAPackage(specifier)) return specifier;
  const target = subpathTarget(importer, specifier);
  if (target === undefined) {
    throw new Error(
      `${importer}: ${specifier} names neither a package nor a file through ${subpathPrefix}, so a consumer could not resolve it from dist.`,
    );
  }
  if (!insideOf(layout.sourceDirectory, target)) {
    throw new Error(
      `${importer}: ${specifier} reaches ${relative(layout.packageRoot, target)}, outside ${relative(layout.packageRoot, layout.sourceDirectory)}, so dist holds no file for it. Import only sources the build compiles.`,
    );
  }
  const path = posix(
    relative(dirname(outputPathOf(importer, layout)), outputPathOf(target, layout)),
  );
  return path.startsWith("../") ? path : `./${path}`;
}

export function distSpecifiers(layout: SourceLayout) {
  return () => {
    const rewrite = (literal: Literal | null | undefined, state: PluginState): void => {
      if (literal?.type !== "StringLiteral" || typeof literal.value !== "string") return;
      if (state.filename === undefined) {
        throw new Error("The build compiles a source with no filename.");
      }
      literal.value = distSpecifier(literal.value, state.filename, layout);
    };
    const rewriteSource = (path: NodePath, state: PluginState) => rewrite(path.node.source, state);
    const visitor = {
      ImportDeclaration: rewriteSource,
      ExportNamedDeclaration: rewriteSource,
      ExportAllDeclaration: rewriteSource,
      ImportExpression: rewriteSource,
    };
    return {
      visitor: {
        Program(path: ProgramPath, state: PluginState) {
          path.traverse(visitor, state);
        },
      },
    };
  };
}

export async function buildSources(
  layout: SourceLayout,
  compile: (filename: string, source: string) => Promise<string>,
  report: (line: string) => void = console.log,
): Promise<void> {
  await rm(layout.outputDirectory, { recursive: true, force: true });
  await mkdir(layout.outputDirectory, { recursive: true });
  const names = await readdir(layout.sourceDirectory, { recursive: true });
  for (const name of names.toSorted()) {
    if (!Object.hasOwn(layout.outputExtensions, extname(name))) continue;
    const filename = join(layout.sourceDirectory, name);
    const output = outputPathOf(filename, layout);
    await mkdir(dirname(output), { recursive: true });
    await writeFile(output, await compile(filename, await readFile(filename, "utf8")));
    report(`${relative(layout.packageRoot, filename)} -> ${relative(layout.packageRoot, output)}`);
  }
}
