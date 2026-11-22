import { parseMarkdown } from "#/scripts/markdown.ts";

export type TlaTsRun = { kind: "command" | "script"; line: string; files: string[] };

const shellBlocks = new Set([
  "",
  "bash",
  "sh",
  "shell",
  "console",
  "zsh",
  "fish",
  "ksh",
  "terminal",
]);
const tlaTsLauncher = /^(?:\S*\/)?tla-ts(?:@[\w.-]+)?$/;
const tlaTsImport =
  /(?:\bfrom\s+|\bimport\s*\(\s*|\brequire\s*\(\s*|\bimport\s+)["']tla-ts(?:\/[^"']*)?["']/;
const word = /"[^"]*"|'[^']*'|\S+/g;
const commandEnd = new Set(["|", "||", "&&", ";", "&"]);
const redirection = /^\d?>>?$|^<$/;
const optionWithTwoValues = "-dump";
const number = /^\d+$/;
const pathLike = /^(?:[\w.-]+\/)*[\w.-]+\.\w[\w.]*$/;

function wordsOf(line: string): string[] {
  return (line.match(word) ?? []).map((each) => each.replace(/^["']|["']$/g, ""));
}

function argumentsOf(words: readonly string[]): string[] {
  const files: string[] = [];
  for (let at = 0; at < words.length; at += 1) {
    const each = words[at];
    if (commandEnd.has(each)) break;
    if (redirection.test(each)) at += 1;
    else if (each === optionWithTwoValues) at += 2;
    else if (each.startsWith("-") && number.test(words[at + 1] ?? "")) at += 1;
    else if (!each.startsWith("-") && pathLike.test(each)) files.push(each);
  }
  return files;
}

function runOf(line: string, readFile: (path: string) => string | undefined): TlaTsRun[] {
  const words = wordsOf(line);
  const launcher = words.findIndex((each) => tlaTsLauncher.test(each));
  if (launcher !== -1) {
    return [{ kind: "command", line, files: argumentsOf(words.slice(launcher + 1)) }];
  }
  const scripts = words.filter(
    (each) => pathLike.test(each) && tlaTsImport.test(readFile(each) ?? ""),
  );
  return scripts.length > 0 ? [{ kind: "script", line, files: scripts }] : [];
}

export function tlaTsRunsOf(
  skill: string,
  readFile: (path: string) => string | undefined,
): TlaTsRun[] {
  return parseMarkdown(skill)
    .blocks.filter(({ info }) => shellBlocks.has(info))
    .flatMap(({ lines }) => lines)
    .flatMap((line) => runOf(line, readFile));
}
