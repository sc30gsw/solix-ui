import { seedVariable } from "#/tests/support/property-seed.ts";

export type TestCommand = { written: string; seed: number | undefined; filters: string[] };
export type MutationEntry = { text: string; commands: TestCommand[] };

const word = /"[^"]*"|'[^']*'|\S+/g;
const item = /^(\s*)(?:[-*]|\d+\.)\s+/;
const mutationItem = new RegExp(
  `${item.source}(?:[^:\\n]*?\\s)?[Mm]utation(?: check)?\\b[^:\\n]*:`,
);
const testCommand = new RegExp(`\`(?:${seedVariable}=(-?\\d+) )?vp test ([^\`]+)\``, "g");
const optionsWithAValue = new Set(["--project", "-t", "--testNamePattern"]);
const subcommand = "run";

const commandSeparator = new Set(["&&", "||", "|", ";", "&"]);

export function wordsOf(line: string): string[] {
  return (line.match(word) ?? []).map((each) => each.replace(/^["']|["']$/g, ""));
}

export function commandsOf(line: string): string[][] {
  const commands: string[][] = [[]];
  for (const each of wordsOf(line)) {
    const ends = each.endsWith(";") && each !== ";";
    const own = ends ? each.slice(0, -1) : each;
    if (commandSeparator.has(own)) commands.push([]);
    else commands.at(-1)?.push(own);
    if (ends) commands.push([]);
  }
  return commands.filter((command) => command.length > 0);
}

function filtersOf(command: string): string[] {
  const words = commandsOf(command)[0] ?? [];
  return words.filter(
    (each, index) =>
      !(index === 0 && each === subcommand) &&
      !each.startsWith("-") &&
      !optionsWithAValue.has(words[index - 1] ?? ""),
  );
}

function entryLines(lines: readonly string[], start: number): string[] {
  const indent = item.exec(lines[start])?.[1].length ?? 0;
  const end = lines.findIndex((line, index) => {
    if (index <= start) return false;
    if (line.trim() === "") return true;
    const leading = /^\s*/.exec(line)?.[0].length ?? 0;
    return leading <= indent;
  });
  return lines.slice(start, end === -1 ? undefined : end);
}

export function mutationEntriesOf(skill: string): MutationEntry[] {
  const lines = skill.split("\n");
  return lines.flatMap((line, start) => {
    if (!mutationItem.test(line)) return [];
    const text = entryLines(lines, start).join("\n");
    const commands = [...text.matchAll(testCommand)].map(([written, seed, rest]) => ({
      written: written.slice(1, -1),
      seed: seed === undefined ? undefined : Number(seed),
      filters: filtersOf(rest),
    }));
    return [{ text, commands }];
  });
}
