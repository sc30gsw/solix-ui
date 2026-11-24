import { seedVariable } from "#/tests/support/property-seed.ts";

export type Runner = "vitest" | "e2e";
export type TestCommand = {
  runner: Runner;
  written: string;
  seed: number | undefined;
  filters: string[];
};
export type MutationEntry = { text: string; commands: TestCommand[] };

const word = /"[^"]*"|'[^']*'|\S+/g;
const item = /^(\s*)(?:[-*]|\d+\.)\s+/;
const mutationItem = new RegExp(
  `${item.source}(?:[^:\\n]*?\\s)?[Mm]utation(?: check)?\\b[^:\\n]*:`,
);
export const e2eRunCommand = "vp run e2e run";
const runnerOfCommand: Readonly<Record<string, Runner>> = {
  "vp test": "vitest",
  [e2eRunCommand]: "e2e",
};
const testCommand = new RegExp(
  `\`(?:${seedVariable}=(-?\\d+) )?(${Object.keys(runnerOfCommand).join("|")}) ([^\`]+)\``,
  "g",
);
const optionsWithAValue: Readonly<Record<Runner, readonly string[]>> = {
  vitest: ["--project", "-t", "--testNamePattern"],
  e2e: ["--output", "--trace", "--target"],
};
const subcommand = "run";

const separator = /(&&|\|\||\||;|&)/;
const quoted = /^(["'])(.*)\1$/s;

export function commandsOf(line: string): string[][] {
  const commands: string[][] = [[]];
  for (const raw of line.match(word) ?? []) {
    const unquoted = quoted.exec(raw);
    if (unquoted !== null) {
      commands.at(-1)?.push(unquoted[2]);
      continue;
    }
    for (const piece of raw.split(separator).filter((each) => each !== "")) {
      if (separator.test(piece)) commands.push([]);
      else commands.at(-1)?.push(piece);
    }
  }
  return commands.filter((command) => command.length > 0);
}

function filtersOf(command: string, runner: Runner): string[] {
  const words = commandsOf(command)[0] ?? [];
  return words.filter(
    (each, index) =>
      !(runner === "vitest" && index === 0 && each === subcommand) &&
      !each.startsWith("-") &&
      !optionsWithAValue[runner].includes(words[index - 1] ?? ""),
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
    const commands = [...text.matchAll(testCommand)].map(([written, seed, command, rest]) => {
      const runner = runnerOfCommand[command] ?? "vitest";
      return {
        runner,
        written: written.slice(1, -1),
        seed: seed === undefined ? undefined : Number(seed),
        filters: filtersOf(rest, runner),
      };
    });
    return [{ text, commands }];
  });
}
