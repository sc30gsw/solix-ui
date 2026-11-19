import { readFileSync, realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

type Token = { word: string } | { operator: string } | { input: string };

type Lexed = { tokens: Token[]; end: number };

const separators = new Set([";", "&", "&&", "|", "||", "|&", "\n", "(", ")", ";;"]);
const fileWrites = new Set([">", ">>", ">|", "&>", "&>>"]);
const hereString = "<<<";
const takesAnOperand = new Set([...fileWrites, "<", ">&", "<&", hereString]);
const pipes = new Set(["|", "|&"]);
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
const commitShortOptionsWithAnAttachedValue = new Set(["u", "S"]);
const hookSwitches = new Set(["HUSKY", "VP_GIT_HOOKS", "VITE_GIT_HOOKS"]);
const hooksOff = "0";
const hooksPathKey = "core.hookspath";
const hookedSubcommands = new Set(["commit", "merge"]);
const configWritingOptions = new Set(["--unset", "--unset-all", "--add", "--replace-all"]);
const configWritingSubcommands = new Set(["set", "unset"]);
const echoes = new Set(["echo", "printf"]);
const playwrightCli = /(^|\/)(@playwright\/test|playwright(-core)?)\/(.*\/)?cli\.m?js$/;
const playwrightPrograms = new Set(["playwright", "playwright-core"]);
const noVerify = "--no-verify";
const shortestNoVerifyGitAccepts = "--no-veri";
const packageManagers = new Set(["pnpm", "npm", "npx", "pnpx", "yarn", "corepack", "vp", "vpr"]);
const configWrites = new Set(["set", "delete"]);
const assignmentTakers = new Set(["env", "export", "declare", "typeset", "local", "readonly"]);
const inPlaceEditors = new Set(["sed", "perl", "yq"]);
const copiers = new Set(["cp", "mv", "install"]);
const ddOutput = "of=";
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
  hooksSkipped:
    "Skipping the git hooks is refused: --no-verify, -n on a commit, HUSKY, VP_GIT_HOOKS or VITE_GIT_HOOKS set to 0, and another core.hooksPath each turn off the checks that make a commit hold only verified code. Fix what the hooks report.",
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
          tokens.push({ input: body });
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

type SimpleCommand = { words: string[]; written: string[]; input: string[]; piped: boolean };

function simpleCommands(tokens: readonly Token[]): SimpleCommand[] {
  const commands: SimpleCommand[] = [{ words: [], written: [], input: [], piped: false }];
  let operand: string | undefined;
  for (const token of tokens) {
    const current = commands[commands.length - 1];
    if ("operator" in token) {
      if (separators.has(token.operator))
        commands.push({ words: [], written: [], input: [], piped: pipes.has(token.operator) });
      operand = takesAnOperand.has(token.operator) ? token.operator : undefined;
    } else if ("input" in token) {
      current.input.push(token.input);
    } else if (operand !== undefined) {
      if (fileWrites.has(operand)) current.written.push(token.word);
      if (operand === hereString) current.input.push(token.word);
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

type GitCall = { name: string; args: string[]; configs: string[] };

function gitSubcommand(args: readonly string[]): GitCall | undefined {
  const configs: string[] = [];
  let index = 0;
  while (index < args.length && args[index].startsWith("-")) {
    if (args[index] === "-c" || args[index] === "--config-env") configs.push(args[index + 1] ?? "");
    index += gitOptionsWithAValue.has(args[index]) ? 2 : 1;
  }
  return index < args.length
    ? { name: args[index], args: args.slice(index + 1), configs }
    : undefined;
}

function setsTheHooksPath(config: string): boolean {
  return config.split("=")[0].toLowerCase() === hooksPathKey;
}

function turnsTheHooksOff(word: string): boolean {
  if (!assignment.test(word)) return false;
  const [name, value] = [word.slice(0, word.indexOf("=")), word.slice(word.indexOf("=") + 1)];
  return hookSwitches.has(name) && value === hooksOff;
}

function writesTheHooksPath(configArgs: readonly string[]): boolean {
  const key = configArgs.findIndex((arg) => arg.toLowerCase() === hooksPathKey);
  if (key === -1) return false;
  return (
    configWritingSubcommands.has(configArgs[0]) ||
    configArgs.some((arg) => configWritingOptions.has(arg)) ||
    configArgs.slice(key + 1).some((arg) => !arg.startsWith("-"))
  );
}

function skipsTheHooksOf({ name, args, configs }: GitCall): boolean {
  if (name === "config") return writesTheHooksPath(args);
  if (!hookedSubcommands.has(name)) return false;
  if (configs.some(setsTheHooksPath)) return true;
  return name === "commit" ? skipsTheHooks(args) : args.includes(noVerify);
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
      const valueAt = letters.findIndex(
        (letter) =>
          commitShortOptionsWithAValue.has(letter) ||
          commitShortOptionsWithAnAttachedValue.has(letter),
      );
      const flags = valueAt === -1 ? letters : letters.slice(0, valueAt);
      if (flags.includes("n")) return true;
      if (valueAt === letters.length - 1 && commitShortOptionsWithAValue.has(letters[valueAt]))
        index += 1;
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
    if (subcommand !== undefined && skipsTheHooksOf(subcommand)) return ["hooksSkipped"];
  }
  if ((playwrightPrograms.has(program) || playwrightCli.test(word)) && !inCi) {
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
  if (assignmentTakers.has(program) && rest.some(turnsTheHooksOff)) return ["hooksSkipped"];
  return [];
}

function refusalsOfCommand({ words }: SimpleCommand, inCi: boolean): Refusal[] {
  const leadingAssignments = words.findIndex((word) => !assignment.test(word));
  const assignments = leadingAssignments === -1 ? words : words.slice(0, leadingAssignments);
  const found: Refusal[] = [
    ...(assignments.some(assignsAReleaseAgeSetting) ? (["releaseAge"] as const) : []),
    ...(assignments.some(turnsTheHooksOff) ? (["hooksSkipped"] as const) : []),
  ];
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

function operandsAfter(words: readonly string[], index: number): string[] {
  return words.slice(index + 1).filter((arg) => !arg.startsWith("-"));
}

function filesWritten({ words, written }: SimpleCommand): string[] {
  return [
    ...written,
    ...words.flatMap((word, index) => {
      const program = programName(word);
      const operands = operandsAfter(words, index);
      if (program === "tee") return operands;
      if (copiers.has(program)) return operands.slice(-1);
      if (program === "dd")
        return words
          .filter((arg) => arg.startsWith(ddOutput))
          .map((arg) => arg.slice(ddOutput.length));
      if (inPlaceEditors.has(program) && words.slice(index + 1).some((arg) => arg.startsWith("-i")))
        return operands.filter((arg) => pnpmConfigFile.test(arg));
      return [];
    }),
  ];
}

function writesAPnpmConfigFile(commands: readonly SimpleCommand[]): boolean {
  const text = commands.flatMap(({ words, input }) => [...words, ...input]);
  return (
    commands.some((command) => filesWritten(command).some((file) => pnpmConfigFile.test(file))) &&
    text.some(namesAReleaseAgeSetting)
  );
}

function programOf({ words }: SimpleCommand): string | undefined {
  const at = words.findIndex((word) => !assignment.test(word));
  return at === -1 ? undefined : programName(words[at]);
}

function shellScriptsIn(command: SimpleCommand, before: SimpleCommand | undefined): string[] {
  const { words, input, piped } = command;
  const scripts = words.flatMap((word, index) => {
    const program = programName(word);
    if (program === "eval") return [words.slice(index + 1).join(" ")];
    if (!shells.has(program)) return [];
    const flag = words.slice(index + 1).findIndex((arg) => shellScriptFlag.test(arg));
    const script = flag === -1 ? undefined : words[index + 2 + flag];
    return script === undefined ? [] : [script];
  });
  if (scripts.length > 0 || !shells.has(programOf(command) ?? "")) return scripts;
  const echoed =
    piped && before !== undefined && echoes.has(programOf(before) ?? "")
      ? [
          before.words
            .slice(before.words.findIndex((word) => echoes.has(programName(word))) + 1)
            .join(" "),
        ]
      : [];
  return [...input, ...echoed];
}

export function refusalsOf(line: string, inCi: boolean): Refusal[] {
  const commands = simpleCommands(lex(line, 0).tokens);
  const found = [
    ...commands.flatMap((command) => refusalsOfCommand(command, inCi)),
    ...(writesAPnpmConfigFile(commands) ? (["releaseAge"] as const) : []),
    ...commands
      .flatMap((command, index) => shellScriptsIn(command, commands[index - 1]))
      .flatMap((script) => refusalsOf(script, inCi)),
  ];
  return [...new Set(found)];
}

const standardInput = 0;
const blocking = 2;

function commandOf(input: string): string | undefined {
  const event: unknown = JSON.parse(input);
  if (typeof event !== "object" || event === null) {
    throw new Error("the hook's input is not an event object.");
  }
  const toolInput: unknown = Reflect.get(event, "tool_input");
  if (Reflect.get(event, "tool_name") !== "Bash" || typeof toolInput !== "object" || !toolInput)
    return undefined;
  const command: unknown = Reflect.get(toolInput, "command");
  return typeof command === "string" ? command : undefined;
}

function decide(): void {
  const command = commandOf(readFileSync(standardInput, "utf8"));
  const found = command === undefined ? [] : refusalsOf(command, Boolean(process.env.CI));
  if (found.length === 0) return;
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: found.map((refusal) => refusals[refusal]).join(" "),
      },
    }),
  );
}

if (
  process.argv[1] !== undefined &&
  realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))
) {
  try {
    decide();
  } catch (error) {
    process.stderr.write(`The command guard failed, so the command is refused: ${String(error)}\n`);
    process.exitCode = blocking;
  }
}
