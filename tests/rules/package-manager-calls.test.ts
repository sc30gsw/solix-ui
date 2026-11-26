import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vite-plus/test";
import {
  repositoryRoot,
  scriptFilesIn,
  scriptFilesInDotDirectoriesIn,
} from "#/scripts/repository.ts";
import { descendants, importsOf, parseAll, parseText, ts, unwrapped } from "#/scripts/syntax.ts";

const runners = new Set(["execFileSync", "execFile", "spawn", "spawnSync", "exec", "execSync"]);
const childProcess = new Set(["node:child_process", "child_process"]);
const packageManagerCommands = new Set(["pm", "why"]);
const internalModule = "scripts/package-manager.internal.ts";
const mayImportTheInternalModule = ["scripts/package-manager.ts", "tests/package-manager.test.ts"];
const mayRunVp = /\bvp\b|vite-plus|installedVp|package-manager\.internal/;
const vpInAShellCommand = /^\s*(vp|\$\{\s*installedVp\s*\})\s+(\S+)/;
const askInstead =
  "ask the package manager through askPackageManager in scripts/package-manager.ts, which checks the vp and the pnpm that answer";
const runTheLocalVp = "run the repository's own vp, installedVp in scripts/repository.ts";

type Names = {
  constants: Map<string, ts.Expression>;
  runners: Map<string, string>;
  namespaces: Set<string>;
};

type Run = { program: ts.Expression | undefined; args: (ts.Expression | undefined)[] };

function namesIn(source: ts.SourceFile): Names {
  const constants = new Map<string, ts.Expression>();
  for (const node of descendants(source)) {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer !== undefined &&
      node.parent.getText().startsWith("const ")
    ) {
      constants.set(node.name.text, node.initializer);
    }
  }
  const imported = importsOf(source).filter(({ specifier }) => childProcess.has(specifier));
  const namespaces = new Set(
    imported.flatMap(({ node }) => {
      const bindings = node.importClause?.namedBindings;
      return bindings && ts.isNamespaceImport(bindings) ? [bindings.name.text] : [];
    }),
  );
  const named = imported.flatMap(({ names }) =>
    names.map(({ imported: original, local }) => [local, original] as const),
  );
  return { constants, runners: new Map(named), namespaces };
}

function resolved(names: Names, expression: ts.Expression, depth = 0): ts.Expression {
  const bare = unwrapped(expression);
  const initializer = ts.isIdentifier(bare) ? names.constants.get(bare.text) : undefined;
  return initializer === undefined || depth > 8 ? bare : resolved(names, initializer, depth + 1);
}

function runnerOf(names: Names, call: ts.CallExpression): string | undefined {
  const callee = resolved(names, call.expression);
  if (ts.isIdentifier(callee)) {
    const original = names.runners.get(callee.text);
    return original !== undefined && runners.has(original) ? original : undefined;
  }
  return ts.isPropertyAccessExpression(callee) &&
    ts.isIdentifier(callee.expression) &&
    names.namespaces.has(callee.expression.text) &&
    runners.has(callee.name.text)
    ? callee.name.text
    : undefined;
}

function textOf(names: Names, expression: ts.Expression | undefined): string | undefined {
  if (expression === undefined) return undefined;
  const value = resolved(names, expression);
  return ts.isStringLiteralLikeNode(value) ? value.text : undefined;
}

function elementsOf(names: Names, expression: ts.Expression | undefined): ts.Expression[] {
  if (expression === undefined) return [];
  const list = resolved(names, expression);
  return ts.isArrayLiteralExpression(list) ? [...list.elements] : [];
}

function isExecPath(names: Names, expression: ts.Expression | undefined): boolean {
  if (expression === undefined) return false;
  const value = resolved(names, expression);
  return (
    ts.isPropertyAccessExpression(value) &&
    ts.isIdentifier(value.expression) &&
    value.expression.text === "process" &&
    value.name.text === "execPath"
  );
}

function isVitePlusBin(names: Names, expression: ts.Expression | undefined): boolean {
  if (expression === undefined) return false;
  const text = resolved(names, expression).getText();
  return text.includes("vite-plus") && text.includes("bin");
}

function problemOf(names: Names, run: Run): string | undefined {
  const [first, second] = run.args;
  const program = run.program === undefined ? undefined : resolved(names, run.program);
  const local = program !== undefined && ts.isIdentifier(program) && program.text === "installedVp";
  const onPath = textOf(names, program) === "vp";
  const copy = isExecPath(names, program) && isVitePlusBin(names, first);
  const command = textOf(names, copy ? second : first);
  if ((local || onPath || copy) && command !== undefined && packageManagerCommands.has(command)) {
    return `runs vp ${command} itself; ${askInstead}`;
  }
  if (onPath) return `runs vp from PATH; ${runTheLocalVp}`;
  if (copy) return `runs the vite-plus bin through process.execPath; ${runTheLocalVp}`;
  return undefined;
}

function shellProblemOf(names: Names, command: ts.Expression | undefined): string | undefined {
  if (command === undefined) return undefined;
  const value = resolved(names, command);
  const text = ts.isStringLiteralLikeNode(value) ? value.text : value.getText().slice(1);
  const [, program, subcommand] = vpInAShellCommand.exec(text) ?? [];
  if (program === undefined) return undefined;
  if (subcommand !== undefined && packageManagerCommands.has(subcommand)) {
    return `runs vp ${subcommand} itself; ${askInstead}`;
  }
  return program === "vp" ? `runs vp from PATH; ${runTheLocalVp}` : undefined;
}

function runsIn(names: Names, node: ts.Node): { what: string; problem: string | undefined }[] {
  if (ts.isCallExpression(node)) {
    const runner = runnerOf(names, node);
    if (runner === undefined) return [];
    const [program, args] = node.arguments;
    const problem =
      runner === "exec" || runner === "execSync"
        ? shellProblemOf(names, program)
        : problemOf(names, { program, args: elementsOf(names, args) });
    return [{ what: runner, problem }];
  }
  if (ts.isPropertyAssignment(node) && ts.isIdentifier(node.name) && node.name.text === "command") {
    const [program, ...args] = elementsOf(names, node.initializer);
    return [{ what: "command", problem: problemOf(names, { program, args }) }];
  }
  return [];
}

function packageManagerCallProblemsIn(source: ts.SourceFile, file: string): string[] {
  const names = namesIn(source);
  const lineOf = (node: ts.Node) => source.getLineAndCharacterOfPosition(node.getStart()).line + 1;
  const imports = mayImportTheInternalModule.includes(file)
    ? []
    : importsOf(source)
        .filter(({ specifier }) => specifier.endsWith(internalModule))
        .map(
          ({ node }) =>
            `${file}:${lineOf(node)}: imports ${internalModule}; only ${mayImportTheInternalModule.join(" and ")} do, so every question to the package manager goes through askPackageManager.`,
        );
  const runs = descendants(source).flatMap((node) =>
    runsIn(names, node).flatMap(({ what, problem }) =>
      problem === undefined ? [] : [`${file}:${lineOf(node)}: ${what} ${problem}.`],
    ),
  );
  return [...imports, ...runs];
}

test("no script or test asks the package manager itself or runs a vp but the repository's own: a question goes through askPackageManager, which alone imports the internal module, and every other run uses installedVp", () => {
  const files = [...scriptFilesIn(), ...scriptFilesInDotDirectoriesIn()].filter((file) =>
    mayRunVp.test(readFileSync(join(repositoryRoot, file), "utf8")),
  );

  expect(files).toEqual(
    expect.arrayContaining(["scripts/repository.ts", ...mayImportTheInternalModule]),
  );
  expect(
    parseAll(files.map((file) => join(repositoryRoot, file))).flatMap((source, index) =>
      packageManagerCallProblemsIn(source, files[index] ?? ""),
    ),
  ).toEqual([]);
});

const imports =
  'import * as childProcess from "node:child_process";\nimport { exec, execFile, execFileSync, execSync, spawn, spawnSync } from "node:child_process";\n';
const bin = 'const bin = join(root, "node_modules/vite-plus/bin/vp");\n';

const refused: [what: string, code: string, problem: string][] = [
  [
    "installedVp asked why",
    'execFileSync(installedVp, ["why", name]);',
    "execFileSync runs vp why itself",
  ],
  ["vp on PATH asked pm pack", 'spawn("vp", ["pm", "pack"]);', "spawn runs vp pm itself"],
  [
    "a namespace import",
    'childProcess.spawnSync("vp", ["why"] as const);',
    "spawnSync runs vp why itself",
  ],
  ["template literals", "execFile(`vp`, [`pm`, `config`]);", "execFile runs vp pm itself"],
  [
    "the vite-plus bin through process.execPath",
    'execFileSync(process.execPath, [join(root, "node_modules/vite-plus/bin/vp"), "why"]);',
    "execFileSync runs vp why itself",
  ],
  [
    "the vite-plus bin held in a constant",
    `${bin}spawnSync(process.execPath, [bin, "pm", "pack"]);`,
    "spawnSync runs vp pm itself",
  ],
  ["a shell command", 'execSync("vp why solid-js");', "execSync runs vp why itself"],
  [
    "a shell command through installedVp",
    "exec(`${installedVp} pm pack`);",
    "exec runs vp pm itself",
  ],
  [
    "arguments held in a constant",
    'const args = ["pm", "pack"];\nexecFileSync(installedVp, args);',
    "execFileSync runs vp pm itself",
  ],
  [
    "a runner imported under another name",
    'import { execFileSync as run } from "node:child_process";\nrun(installedVp, ["why"]);',
    "execFileSync runs vp why itself",
  ],
  [
    "a runner held in a constant",
    'const run = spawnSync;\nrun("vp", ["why"]);',
    "spawnSync runs vp why itself",
  ],
  [
    "installedVp held in a constant",
    'const local = installedVp;\nspawn(local, ["why"]);',
    "spawn runs vp why itself",
  ],
  [
    "a command array",
    'startServer({ command: [installedVp, "why", "solid-js"] });',
    "command runs vp why itself",
  ],
  ["vp from PATH", 'spawn("vp", ["test"]);', "spawn runs vp from PATH"],
  ["a shell command that runs vp from PATH", 'execSync("vp test");', "execSync runs vp from PATH"],
  [
    "another command through the vite-plus bin",
    `${bin}execFileSync(process.execPath, [bin, "fmt"]);`,
    "execFileSync runs the vite-plus bin through process.execPath",
  ],
  [
    "the internal module",
    'import { askWith } from "#/scripts/package-manager.internal.ts";\naskWith(seam, ["why"], options);',
    `imports ${internalModule}`,
  ],
];

const allowed: [what: string, code: string][] = [
  ["installedVp for another command", 'execFileSync(installedVp, ["fmt", file]);'],
  ["another program", 'execFileSync("vpx", ["pm"]);'],
  ["askPackageManager", 'askPackageManager(["why", name], options);'],
  ["a command array for another command", 'startServer({ command: [installedVp, "preview"] });'],
  ["a pattern's exec", 'const pattern = /vp/;\npattern.exec("vp why");'],
  ["a run of a function that is not a child process runner", 'run("vp", ["why"]);'],
];

test.for(refused)("the package-manager rule refuses %s", ([, code, problem]) => {
  const problems = packageManagerCallProblemsIn(
    parseText(`${imports}${code}\n`, ".ts"),
    "fixture.ts",
  );

  expect(problems).toHaveLength(1);
  expect(problems[0]).toContain(problem);
});

test.for(allowed)("the package-manager rule allows %s", ([, code]) => {
  expect(
    packageManagerCallProblemsIn(parseText(`${imports}${code}\n`, ".ts"), "fixture.ts"),
  ).toEqual([]);
});

test("the package-manager rule lets the public module and its test import the internal one", () => {
  const source = parseText(
    'import { askWith } from "#/scripts/package-manager.internal.ts";\n',
    ".ts",
  );

  for (const file of mayImportTheInternalModule) {
    expect(packageManagerCallProblemsIn(source, file)).toEqual([]);
  }
});
