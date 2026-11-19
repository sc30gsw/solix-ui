type Token = { word: string } | { operator: string };

type Lexed = { tokens: Token[]; end: number };

const separators = new Set([";", "&", "&&", "|", "||", "|&", "\n", "(", ")", ";;"]);
const fileWrites = new Set([">", ">>", ">|", "&>", "&>>"]);
const takesAnOperand = new Set([...fileWrites, "<", ">&", "<&", "<<<"]);
const operators = [
  "&>>",
  "<<<",
  "<<-",
  "&&",
  "||",
  "|&",
  ";;",
  ">>",
  ">|",
  "&>",
  ">&",
  "<&",
  "<<",
  ";",
  "&",
  "|",
  "(",
  ")",
  "<",
  ">",
  "\n",
];
const wordEnd = /[\s;&|()<>`]/;
const fileDescriptor = /^\d+$/;
const shells = new Set(["sh", "bash", "dash", "zsh", "ksh"]);
const shellScriptFlag = /^-[a-z]*c[a-z]*$/;
const readsData = new Set([
  "echo",
  "printf",
  "grep",
  "rg",
  "ag",
  "awk",
  "cat",
  "less",
  "head",
  "tail",
  "man",
  "which",
  "type",
]);
const gitOptionsWithAValue = new Set([
  "-C",
  "-c",
  "--git-dir",
  "--work-tree",
  "--namespace",
  "--config-env",
  "--super-prefix",
]);
const commitShortOptionsWithAValue = new Set(["m", "F", "c", "C", "t"]);
const noVerify = "--no-verify";
const shortestNoVerifyGitAccepts = "--no-veri";
const packageManagers = new Set(["pnpm", "npm", "npx", "pnpx", "yarn", "corepack", "vp", "vpr"]);
const configWrites = new Set(["set", "delete"]);
const assignmentTakers = new Set(["env", "export", "declare", "typeset", "local", "readonly"]);
const inPlaceEditors = new Set(["sed", "perl", "yq"]);
const fileWriters = new Set(["tee", "dd", "cp", "mv", "install"]);
const pnpmConfigFile = /pnpm-workspace\.ya?ml|\.npmrc|package\.json|pnpm\/rc\b/;
const assignment = /^[A-Za-z_][A-Za-z0-9_]*=/;
const versionSuffix = /@[^/]*$/;
const notNameCharacter = /[^a-z]/g;
const releaseAgeSettings = ["minimumreleaseage", "trustlockfile"];

export const refusals = {
  stash:
    "git stash is refused: the stash is shared by every worktree of this repository, so another agent's stash can be popped into yours. Commit the work on a branch instead.",
  playwrightInstall:
    "playwright install is refused outside CI: the local browsers are the ones the tests were confirmed with. Use the installed ones, and leave recording evidence to CI.",
  noVerify:
    "git commit --no-verify (or -n) is refused: the pre-commit hook is what makes a commit hold only verified code. Fix what the hook reports.",
  releaseAge:
    "Setting a pnpm release-age setting, minimumReleaseAgeExclude or trustLockfile is refused: a release younger than the minimum age is not installed. Wait for it.",
} as const;

export type Refusal = keyof typeof refusals;

function operatorAt(line: string, index: number): string | undefined {
  return operators.find((operator) => line.startsWith(operator, index));
}

function heredocBody(line: string, from: number, delimiter: string): { body: string; end: number } {
  const lines: string[] = [];
  let index = from;
  while (index < line.length) {
    const next = line.indexOf("\n", index);
    const text = line.slice(index, next === -1 ? line.length : next);
    index = next === -1 ? line.length : next + 1;
    if (text.replace(/^\t+/, "") === delimiter) break;
    lines.push(text);
  }
  return { body: lines.join("\n"), end: index };
}

function lex(line: string, start: number, closer?: string): Lexed {
  const tokens: Token[] = [];
  const pendingHeredocs: string[] = [];
  let word: string | undefined;
  let depth = 0;
  let index = start;
  const flush = () => {
    if (word !== undefined) tokens.push({ word });
    word = undefined;
  };
  const append = (text: string) => {
    word = (word ?? "") + text;
  };
  const substitution = (at: number, opener: string, ends: string) => {
    flush();
    const inner = lex(line, at + opener.length, ends);
    tokens.push({ operator: "(" }, ...inner.tokens, { operator: ")" });
    return inner.end;
  };
  while (index < line.length) {
    const character = line[index];
    if (closer === "`" && character === "`")
      return { tokens: [...tokens, ...wordOf(word)], end: index + 1 };
    if (closer === ")" && character === ")" && depth === 0) {
      flush();
      return { tokens, end: index + 1 };
    }
    if (character === "\\" && index + 1 < line.length) {
      if (line[index + 1] !== "\n") append(line[index + 1]);
      index += 2;
    } else if (character === "'") {
      const end = line.indexOf("'", index + 1);
      append(line.slice(index + 1, end === -1 ? line.length : end));
      index = end === -1 ? line.length : end + 1;
    } else if (character === '"') {
      index += 1;
      append("");
      while (index < line.length && line[index] !== '"') {
        if (line[index] === "\\" && index + 1 < line.length) {
          append(line[index + 1]);
          index += 2;
        } else if (line.startsWith("$(", index)) {
          index = substitution(index, "$(", ")");
          append("");
        } else if (line[index] === "`") {
          index = substitution(index, "`", "`");
          append("");
        } else {
          append(line[index]);
          index += 1;
        }
      }
      index += 1;
    } else if (line.startsWith("$(", index)) {
      index = substitution(index, "$(", ")");
    } else if (character === "`") {
      index = substitution(index, "`", "`");
    } else if (character === " " || character === "\t") {
      flush();
      index += 1;
    } else if (character === "#" && word === undefined) {
      const end = line.indexOf("\n", index);
      index = end === -1 ? line.length : end;
    } else {
      const operator = operatorAt(line, index);
      if (operator === undefined) {
        append(character);
        index += 1;
        continue;
      }
      if (word !== undefined && fileDescriptor.test(word) && operator.includes(">"))
        word = undefined;
      flush();
      index += operator.length;
      if (operator === "<<" || operator === "<<-") {
        while (line[index] === " " || line[index] === "\t") index += 1;
        let delimiter = "";
        while (index < line.length && !wordEnd.test(line[index])) {
          if (line[index] !== "'" && line[index] !== '"' && line[index] !== "\\")
            delimiter += line[index];
          index += 1;
        }
        pendingHeredocs.push(delimiter);
        continue;
      }
      if (operator === "\n" && pendingHeredocs.length > 0) {
        for (const delimiter of pendingHeredocs.splice(0)) {
          const { body, end } = heredocBody(line, index, delimiter);
          tokens.push({ word: body });
          index = end;
        }
      }
      if (operator === "(") depth += 1;
      if (operator === ")") depth -= 1;
      tokens.push({ operator });
    }
  }
  flush();
  return { tokens, end: index };
}

function wordOf(word: string | undefined): Token[] {
  return word === undefined ? [] : [{ word }];
}

type SimpleCommand = { words: string[]; written: string[] };

function simpleCommands(tokens: readonly Token[]): SimpleCommand[] {
  const commands: SimpleCommand[] = [{ words: [], written: [] }];
  let operand: string | undefined;
  for (const token of tokens) {
    const current = commands[commands.length - 1];
    if ("operator" in token) {
      if (separators.has(token.operator)) commands.push({ words: [], written: [] });
      operand = takesAnOperand.has(token.operator) ? token.operator : undefined;
    } else if (operand !== undefined) {
      if (fileWrites.has(operand)) current.written.push(token.word);
      operand = undefined;
    } else {
      current.words.push(token.word);
    }
  }
  return commands.filter(({ words, written }) => words.length + written.length > 0);
}

function programName(word: string): string {
  return (word.split("/").at(-1) ?? word).replace(versionSuffix, "");
}

function namesAReleaseAgeSetting(text: string): boolean {
  const name = text.toLowerCase().replace(notNameCharacter, "");
  return releaseAgeSettings.some((setting) => name.includes(setting));
}

function assignsAReleaseAgeSetting(word: string): boolean {
  return assignment.test(word) && namesAReleaseAgeSetting(word.slice(0, word.indexOf("=")));
}

function gitSubcommand(args: readonly string[]): { name: string; args: string[] } | undefined {
  let index = 0;
  while (index < args.length && args[index].startsWith("-")) {
    index += gitOptionsWithAValue.has(args[index]) ? 2 : 1;
  }
  return index < args.length ? { name: args[index], args: args.slice(index + 1) } : undefined;
}

function skipsTheHooks(commitArgs: readonly string[]): boolean {
  for (let index = 0; index < commitArgs.length; index += 1) {
    const arg = commitArgs[index];
    if (arg === "--") return false;
    if (arg.startsWith("--")) {
      const option = arg.split("=")[0];
      if (option.length >= shortestNoVerifyGitAccepts.length && noVerify.startsWith(option))
        return true;
    } else if (arg.startsWith("-") && arg.length > 1) {
      const letters = arg.slice(1).split("");
      const valueAt = letters.findIndex((letter) => commitShortOptionsWithAValue.has(letter));
      const flags = valueAt === -1 ? letters : letters.slice(0, valueAt);
      if (flags.includes("n")) return true;
      if (valueAt === letters.length - 1) index += 1;
    }
  }
  return false;
}

function refusalsFrom(
  program: string,
  word: string,
  rest: readonly string[],
  inCi: boolean,
): Refusal[] {
  if (program === "git") {
    const subcommand = gitSubcommand(rest);
    if (subcommand?.name === "stash") return ["stash"];
    if (subcommand?.name === "commit" && skipsTheHooks(subcommand.args)) return ["noVerify"];
  }
  if ((program === "playwright" || word.endsWith("playwright/cli.js")) && !inCi) {
    if (rest.find((arg) => !arg.startsWith("-")) === "install") return ["playwrightInstall"];
  }
  if (packageManagers.has(program)) {
    const writesConfig = rest[0] === "config" && rest.slice(1).some((arg) => configWrites.has(arg));
    const sets = rest.some(
      (arg) => namesAReleaseAgeSetting(arg) && (arg.startsWith("--") || writesConfig),
    );
    if (sets) return ["releaseAge"];
  }
  if (assignmentTakers.has(program) && rest.some(assignsAReleaseAgeSetting)) return ["releaseAge"];
  return [];
}

function refusalsOfCommand({ words }: SimpleCommand, inCi: boolean): Refusal[] {
  const leadingAssignments = words.findIndex((word) => !assignment.test(word));
  const assignments = leadingAssignments === -1 ? words : words.slice(0, leadingAssignments);
  const found: Refusal[] = assignments.some(assignsAReleaseAgeSetting) ? ["releaseAge"] : [];
  if (leadingAssignments === -1) return found;
  const program = programName(words[leadingAssignments]);
  if (readsData.has(program)) return found;
  const scanned =
    program === "git"
      ? [leadingAssignments]
      : words.map((_, index) => index).slice(leadingAssignments);
  for (const index of scanned) {
    found.push(
      ...refusalsFrom(programName(words[index]), words[index], words.slice(index + 1), inCi),
    );
  }
  return found;
}

function writesAPnpmConfigFile(commands: readonly SimpleCommand[]): boolean {
  const writes = commands.some(
    ({ words, written }) =>
      written.length > 0 ||
      words.some(
        (word, index) =>
          fileWriters.has(programName(word)) ||
          (inPlaceEditors.has(programName(word)) &&
            words.slice(index + 1).some((arg) => arg.startsWith("-i"))),
      ),
  );
  const text = commands.flatMap(({ words, written }) => [...words, ...written]);
  return (
    writes && text.some(namesAReleaseAgeSetting) && text.some((word) => pnpmConfigFile.test(word))
  );
}

function shellScriptsIn({ words }: SimpleCommand): string[] {
  return words.flatMap((word, index) => {
    const program = programName(word);
    if (program === "eval") return [words.slice(index + 1).join(" ")];
    if (!shells.has(program)) return [];
    const flag = words.slice(index + 1).findIndex((arg) => shellScriptFlag.test(arg));
    const script = flag === -1 ? undefined : words[index + 2 + flag];
    return script === undefined ? [] : [script];
  });
}

export function refusalsOf(line: string, inCi: boolean): Refusal[] {
  const commands = simpleCommands(lex(line, 0).tokens);
  const found = [
    ...commands.flatMap((command) => refusalsOfCommand(command, inCi)),
    ...(writesAPnpmConfigFile(commands) ? (["releaseAge"] as const) : []),
    ...commands.flatMap(shellScriptsIn).flatMap((script) => refusalsOf(script, inCi)),
  ];
  return [...new Set(found)];
}
