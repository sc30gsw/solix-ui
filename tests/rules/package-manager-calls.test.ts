import { readFileSync } from "node:fs";
import { join, posix } from "node:path";
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
const internalModuleStem = "scripts/package-manager.internal";
const mayImportTheInternalModule = ["scripts/package-manager.ts", "tests/package-manager.test.ts"];
const mayRunVp = /\bvp\b|vite-plus|installedVp|package-manager\.internal/;
const shellSeparators = /&&|\|\||[;&|\n]/;
const envAssignment = /^[A-Za-z_]\w*=\S*\s+/;
const vpAtSegmentStart = /^(vp|\$\{\s*installedVp\s*\})\s+(\S+)/;
const askInstead =
  "ask the package manager through askPackageManager in scripts/package-manager.ts, which checks the vp and the pnpm that answer";
const runTheLocalVp = "run the repository's own vp, installedVp in scripts/repository.ts";

type Names = {
  constantsByContainer: Map<ts.Node, Map<string, ts.Expression | undefined>>;
  runners: Map<string, string>;
  namespaces: Set<string>;
};

type Run = { program: ts.Expression | undefined; args: (ts.Expression | undefined)[] };

function recordBinding(
  constantsByContainer: Map<ts.Node, Map<string, ts.Expression | undefined>>,
  container: ts.Node,
  name: string,
  value: ts.Expression | undefined,
): void {
  let table = constantsByContainer.get(container);
  if (table === undefined) {
    table = new Map<string, ts.Expression | undefined>();
    constantsByContainer.set(container, table);
  }
  table.set(name, value);
}

function namesIn(source: ts.SourceFile): Names {
  const constantsByContainer = new Map<ts.Node, Map<string, ts.Expression | undefined>>();
  for (const node of descendants(source)) {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      ts.isVariableDeclarationList(node.parent)
    ) {
      const statement = node.parent.parent;
      const container = ts.isVariableStatement(statement) ? statement.parent : statement;
      const isConst = (node.parent.flags & ts.NodeFlags.Const) !== 0;
      recordBinding(
        constantsByContainer,
        container,
        node.name.text,
        isConst ? node.initializer : undefined,
      );
    } else if (ts.isParameterDeclaration(node) && ts.isIdentifier(node.name)) {
      recordBinding(constantsByContainer, node.parent, node.name.text, undefined);
    }
  }
  const imported = importsOf(source).filter(({ specifier }) => childProcess.has(specifier));
  const namespaces = new Set(
    imported.flatMap(({ node }) => {
      const clause = node.importClause;
      const found: string[] = [];
      if (clause?.name !== undefined) found.push(clause.name.text);
      const bindings = clause?.namedBindings;
      if (bindings && ts.isNamespaceImport(bindings)) found.push(bindings.name.text);
      return found;
    }),
  );
  const named = imported.flatMap(({ names }) =>
    names.map(({ imported: original, local }) => [local, original] as const),
  );
  return { constantsByContainer, runners: new Map(named), namespaces };
}

function lookupConstant(
  names: Names,
  from: ts.Node,
  identifier: string,
): ts.Expression | undefined {
  for (let current: ts.Node | undefined = from; current !== undefined; current = current.parent) {
    const table = names.constantsByContainer.get(current);
    if (table?.has(identifier)) return table.get(identifier);
  }
  return undefined;
}

function propertyOfObject(
  object: ts.ObjectLiteralExpression,
  name: string,
): ts.Expression | undefined {
  for (const property of object.properties) {
    if (ts.isPropertyAssignment(property)) {
      const key =
        ts.isIdentifier(property.name) || ts.isStringLiteralLikeNode(property.name)
          ? property.name.text
          : undefined;
      if (key === name) return property.initializer;
    } else if (
      ts.isShorthandPropertyAssignment(property) &&
      ts.isIdentifier(property.name) &&
      property.name.text === name
    ) {
      return property.name;
    }
  }
  return undefined;
}

function resolved(names: Names, expression: ts.Expression, depth = 0): ts.Expression {
  const bare = unwrapped(expression);
  if (depth > 8) return bare;
  if (ts.isIdentifier(bare)) {
    const initializer = lookupConstant(names, bare, bare.text);
    return initializer === undefined ? bare : resolved(names, initializer, depth + 1);
  }
  if (ts.isPropertyAccessExpression(bare)) {
    const target = resolved(names, bare.expression, depth + 1);
    if (ts.isObjectLiteralExpression(target)) {
      const value = propertyOfObject(target, bare.name.text);
      if (value !== undefined) return resolved(names, value, depth + 1);
    }
  }
  return bare;
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

function elementsOf(
  names: Names,
  expression: ts.Expression | undefined,
  depth = 0,
): ts.Expression[] {
  if (expression === undefined || depth > 8) return [];
  const list = resolved(names, expression);
  if (!ts.isArrayLiteralExpression(list)) return [];
  return list.elements.flatMap((element) =>
    ts.isSpreadElement(element) ? elementsOf(names, element.expression, depth + 1) : [element],
  );
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
  const raw = value.getText();
  const text = ts.isStringLiteralLikeNode(value)
    ? value.text
    : raw.startsWith("`") && raw.endsWith("`")
      ? raw.slice(1, -1)
      : undefined;
  if (text === undefined) return undefined;
  for (const part of text.split(shellSeparators)) {
    let segment = part.trim();
    while (envAssignment.test(segment)) segment = segment.replace(envAssignment, "");
    const [, program, subcommand] = vpAtSegmentStart.exec(segment) ?? [];
    if (program === undefined) continue;
    if (subcommand !== undefined && packageManagerCommands.has(subcommand)) {
      return `runs vp ${subcommand} itself; ${askInstead}`;
    }
    if (program === "vp") return `runs vp from PATH; ${runTheLocalVp}`;
  }
  return undefined;
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

function resolvesToInternalModule(file: string, specifier: string): boolean {
  const normalized = specifier.startsWith("#/")
    ? specifier.slice(2)
    : specifier.startsWith(".")
      ? posix.normalize(posix.join(posix.dirname(file.replaceAll("\\", "/")), specifier))
      : specifier;
  return normalized.replace(/\.(?:mts|mjs|ts|js)$/, "") === internalModuleStem;
}

function moduleSpecifierIn(node: ts.Node): string | undefined {
  if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier) {
    return ts.isStringLiteralLikeNode(node.moduleSpecifier) ? node.moduleSpecifier.text : undefined;
  }
  if (ts.isCallExpression(node) && node.arguments.length >= 1) {
    const [first] = node.arguments;
    if (!ts.isStringLiteralLikeNode(first)) return undefined;
    if (node.expression.kind === ts.SyntaxKind.ImportKeyword) return first.text;
    if (ts.isIdentifier(node.expression) && node.expression.text === "require") return first.text;
  }
  return undefined;
}

function packageManagerCallProblemsIn(source: ts.SourceFile, file: string): string[] {
  const names = namesIn(source);
  const lineOf = (node: ts.Node) => source.getLineAndCharacterOfPosition(node.getStart()).line + 1;
  const imports = mayImportTheInternalModule.includes(file)
    ? []
    : descendants(source).flatMap((node) => {
        const specifier = moduleSpecifierIn(node);
        return specifier !== undefined && resolvesToInternalModule(file, specifier)
          ? [
              `${file}:${lineOf(node)}: imports ${internalModule}; only ${mayImportTheInternalModule.join(" and ")} do, so every question to the package manager goes through askPackageManager.`,
            ]
          : [];
      });
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
  [
    "a relative import of the internal module",
    'import { askWith } from "./scripts/package-manager.internal.ts";\naskWith(seam, ["why"], options);',
    `imports ${internalModule}`,
  ],
  [
    "an extensionless import of the internal module",
    'import { askWith } from "#/scripts/package-manager.internal";\naskWith(seam, ["why"], options);',
    `imports ${internalModule}`,
  ],
  [
    "a re-export of the internal module",
    'export { askWith } from "#/scripts/package-manager.internal.ts";',
    `imports ${internalModule}`,
  ],
  [
    "a dynamic import of the internal module",
    'await import("#/scripts/package-manager.internal.ts");',
    `imports ${internalModule}`,
  ],
  [
    "a default import of child_process",
    'import cp from "node:child_process";\ncp.execFileSync(installedVp, ["why"]);',
    "execFileSync runs vp why itself",
  ],
  [
    "spread arguments",
    'const base = ["pm"];\nexecFileSync(installedVp, [...base, "pack"]);',
    "execFileSync runs vp pm itself",
  ],
  [
    "a chained shell command",
    'execSync("cd sub && vp why solid-js");',
    "execSync runs vp why itself",
  ],
  [
    "an object property holding vp",
    'const opts = { command: "vp" };\nspawn(opts.command, ["why"]);',
    "spawn runs vp why itself",
  ],
  [
    "an outer const shadowed only in a sibling block",
    'const cmd = "vp";\n{ const cmd = "echo"; spawn(cmd, ["hi"]); }\nspawn(cmd, ["why"]);',
    "spawn runs vp why itself",
  ],
];

const allowed: [what: string, code: string][] = [
  ["installedVp for another command", 'execFileSync(installedVp, ["fmt", file]);'],
  ["another program", 'execFileSync("vpx", ["pm"]);'],
  ["askPackageManager", 'askPackageManager(["why", name], options);'],
  ["a command array for another command", 'startServer({ command: [installedVp, "preview"] });'],
  ["a pattern's exec", 'const pattern = /vp/;\npattern.exec("vp why");'],
  ["a run of a function that is not a child process runner", 'run("vp", ["why"]);'],
  [
    "an inner const shadowing an outer vp constant",
    'const cmd = "vp";\nfunction f() { const cmd = "echo"; spawn(cmd, ["why"]); }',
  ],
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
