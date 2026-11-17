import { dirname, extname, isAbsolute, join, relative, sep } from "node:path";

export const subpathPrefix = "#/";

export type SourceLayout = {
  packageRoot: string;
  sourceDirectory: string;
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

const loadingNodes = [
  "ImportDeclaration",
  "ExportNamedDeclaration",
  "ExportAllDeclaration",
  "ImportExpression",
].join("|");

function posix(path: string): string {
  return path.split(sep).join("/");
}

export function insideOf(directory: string, file: string): boolean {
  const path = relative(directory, file);
  return path !== "" && !isAbsolute(path) && path.split(sep)[0] !== "..";
}

export function subpathTarget(specifier: string, packageRoot: string): string | undefined {
  return specifier.startsWith(subpathPrefix)
    ? join(packageRoot, specifier.slice(subpathPrefix.length))
    : undefined;
}

export function outputPathOf(file: string, layout: SourceLayout): string {
  const extension = extname(file);
  const output = layout.outputExtensions[extension];
  if (output === undefined) {
    throw new Error(
      `${file}: the build writes no output for a ${extension || "extensionless"} file; it compiles ${Object.keys(layout.outputExtensions).join(", ")}.`,
    );
  }
  return `${file.slice(0, file.length - extension.length)}${output}`;
}

export function distSpecifier(specifier: string, importer: string, layout: SourceLayout): string {
  if (/^\.{1,2}\//.test(specifier)) {
    throw new Error(
      `${importer}: ${specifier} is relative. Name a file of this package with ${subpathPrefix} and its path from the package root, or run vp run migrate:subpath-imports.`,
    );
  }
  const target = subpathTarget(specifier, layout.packageRoot);
  if (target === undefined) return specifier;
  if (!insideOf(layout.sourceDirectory, target)) {
    throw new Error(
      `${importer}: ${specifier} reaches ${relative(layout.packageRoot, target)}, outside ${relative(layout.packageRoot, layout.sourceDirectory)}, so dist holds no file for it. Import only sources the build compiles.`,
    );
  }
  const path = posix(relative(dirname(importer), outputPathOf(target, layout)));
  return path.startsWith("../") ? path : `./${path}`;
}

export function distSpecifiers(layout: SourceLayout) {
  return () => {
    const rewrite = (literal: Literal | null | undefined, state: PluginState): void => {
      if (literal?.type !== "StringLiteral" || typeof literal.value !== "string") return;
      if (state.filename === undefined)
        throw new Error("The build compiles a source with no filename.");
      literal.value = distSpecifier(literal.value, state.filename, layout);
    };
    const visitor = {
      [loadingNodes](path: NodePath, state: PluginState) {
        rewrite(path.node.source, state);
      },
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
