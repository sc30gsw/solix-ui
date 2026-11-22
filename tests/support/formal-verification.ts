import { parseMarkdown } from "#/scripts/markdown.ts";

export type TlaTsRun =
  | { kind: "command"; line: string; files: string[] }
  | { kind: "script"; line: string; files: string[] };

const commandBlocks = new Set(["", "bash", "sh", "shell", "console"]);
const tlaTsCommand = /(?:^|[\s;&|(])tla-ts(?=\s|$)(.*)$/;
const tlaTsImport = /(?:\bfrom\s+|\bimport\s*\(\s*)["']tla-ts(?:\/[^"']*)?["']/;
const repositoryPath = /(?:^|\s)((?:[\w.-]+\/)*[\w.-]+\.[\w.]+)(?=\s|$)/g;

function pathsIn(text: string): string[] {
  return [...text.matchAll(repositoryPath)].map(([, path]) => path);
}

export function tlaTsRunsOf(
  skill: string,
  readFile: (path: string) => string | undefined,
): TlaTsRun[] {
  return parseMarkdown(skill)
    .blocks.filter(({ info }) => commandBlocks.has(info))
    .flatMap(({ lines }) => lines)
    .flatMap((line): TlaTsRun[] => {
      const command = tlaTsCommand.exec(line);
      if (command !== null) return [{ kind: "command", line, files: pathsIn(command[1]) }];
      const scripts = pathsIn(line).filter((path) => tlaTsImport.test(readFile(path) ?? ""));
      return scripts.length > 0 ? [{ kind: "script", line, files: scripts }] : [];
    });
}
