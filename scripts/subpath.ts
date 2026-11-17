import { existsSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

export const subpathPrefix = "#/";
export const subpathPattern = `${subpathPrefix}*`;
export const subpathPatternTarget = "./*";

export function posix(path: string): string {
  return path.split(sep).join("/");
}

export function insideOf(directory: string, file: string): boolean {
  const path = relative(directory, file);
  return path !== "" && !isAbsolute(path) && path.split(sep)[0] !== "..";
}

export function namesAPackage(specifier: string): boolean {
  return !/^(?:\.{1,2}\/|\/|#)/.test(specifier) && !URL.canParse(specifier);
}

export function isRelative(specifier: string): boolean {
  return /^\.{1,2}\//.test(specifier);
}

export function packageRootOf(file: string): string {
  const directory = dirname(file);
  if (existsSync(join(directory, "package.json"))) return directory;
  if (dirname(directory) === directory) {
    throw new Error(`${file}: no package.json holds this file.`);
  }
  return packageRootOf(directory);
}

export function subpathTarget(importer: string, specifier: string): string | undefined {
  return specifier.startsWith(subpathPrefix)
    ? join(packageRootOf(importer), specifier.slice(subpathPrefix.length))
    : undefined;
}

export function fileNamedBy(importer: string, specifier: string): string | undefined {
  return isRelative(specifier)
    ? resolve(dirname(importer), specifier)
    : subpathTarget(importer, specifier);
}

export function subpathSpecifierOf(importer: string, file: string): string | undefined {
  const root = packageRootOf(importer);
  return insideOf(root, file) ? `${subpathPrefix}${posix(relative(root, file))}` : undefined;
}
