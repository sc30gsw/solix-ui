import { readFileSync } from "node:fs";
import { join, posix } from "node:path";
import { expect, test } from "vite-plus/test";
import { repositoryRoot } from "#/scripts/repository.ts";
import {
  descendants,
  importsOf,
  isExported,
  moduleSpecifierOf,
  parseAll,
  parseText,
  staticPropertyName,
  ts,
  unwrapped,
} from "#/scripts/syntax.ts";
import { scriptFiles, scriptFilesInDotDirectories } from "#/tests/support/workspace.ts";

const runners = new Set(["execFileSync", "execFile", "spawn", "spawnSync", "exec", "execSync"]);
const childProcess = new Set(["node:child_process", "child_process"]);
const packageManagerCommands = new Set(["pm", "why"]);
const publicModule = "scripts/package-manager.ts";
const internalModule = "scripts/package-manager.internal.ts";
const internalModuleStem = internalModule.replace(/\.ts$/, "");
const mayImportTheInternalModule = [publicModule, "tests/package-manager.test.ts"];
const publicArities: Readonly<Record<string, number>> = {
  askPackageManager: 2,
  installedVitePlusVersion: 0,
};
const allowedPublicReExports = new Set([
  "packageManagerConfigQuery",
  "PackageManagerMismatch",
  "PackageManagerQueryFailed",
  "pinnedPnpmOf",
  "VitePlusNotFound",
  "VitePlusVersionMismatch",
  "withoutPackageManagerEnv",
  "WorkingDirectoryMissing",
]);
const mayRunVp = /\bvp\b|vite-plus|installedVp|package-manager\.internal/;
const shellSeparators = /&&|\|\||[;&|\n]/;
const envAssignment = /^[A-Za-z_]\w*=\S*\s+/;
const vpAtSegmentStart = /^(?:["']?)(vp|\$\{\s*installedVp\s*\})(?:["']?)(?:\s+(\S+)|$)/;
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

function namesIn(source: ts.SourceFile, nodes: readonly ts.Node[]): Names {
  const constantsByContainer = new Map<ts.Node, Map<string, ts.Expression | undefined>>();
  for (const node of nodes) {
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

function propertyValue(node: ts.Node, name: string): ts.Expression | undefined {
  if (staticPropertyName(node) !== name) return undefined;
  if (ts.isPropertyAssignment(node)) return node.initializer;
  if (ts.isShorthandPropertyAssignment(node) && ts.isIdentifier(node.name)) return node.name;
  return undefined;
}

function propertyOfObject(
  object: ts.ObjectLiteralExpression,
  name: string,
): ts.Expression | undefined {
  for (const property of object.properties) {
    const value = propertyValue(property, name);
    if (value !== undefined) return value;
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
  if (ts.isPropertyAccessExpression(callee)) {
    const receiver = resolved(names, callee.expression);
    if (
      ts.isIdentifier(receiver) &&
      names.namespaces.has(receiver.text) &&
      runners.has(callee.name.text)
    ) {
      return callee.name.text;
    }
  }
  return undefined;
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

function shellTextOf(names: Names, value: ts.Expression): string | undefined {
  if (ts.isStringLiteralLikeNode(value)) return value.text;
  if (value.kind !== ts.SyntaxKind.TemplateExpression) return undefined;
  const parts: string[] = [];
  value.forEachChild((child) => {
    if (ts.isTemplateHead(child)) {
      parts.push(child.text);
      return;
    }
    child.forEachChild((piece) => {
      if (ts.isTemplateMiddle(piece) || ts.isTemplateTail(piece)) {
        parts.push(piece.text);
        return;
      }
      if (!ts.isExpression(piece)) return;
      const part = resolved(names, piece);
      parts.push(
        ts.isIdentifier(part) && part.text === "installedVp"
          ? "${installedVp}"
          : ts.isStringLiteralLikeNode(part)
            ? part.text
            : `\${${piece.getText()}}`,
      );
    });
  });
  return parts.join("");
}

function shellProblemOf(names: Names, command: ts.Expression | undefined): string | undefined {
  if (command === undefined) return undefined;
  const text = shellTextOf(names, resolved(names, command));
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

function runsIn(names: Names, node: ts.Node): { what: string; problem: string } | undefined {
  if (ts.isCallExpression(node)) {
    const runner = runnerOf(names, node);
    if (runner === undefined) return undefined;
    const [program, args] = node.arguments;
    const problem =
      runner === "exec" || runner === "execSync"
        ? shellProblemOf(names, program)
        : problemOf(names, { program, args: elementsOf(names, args) });
    return problem === undefined ? undefined : { what: runner, problem };
  }
  const command = propertyValue(node, "command");
  if (command !== undefined) {
    const [program, ...args] = elementsOf(names, command);
    const problem = problemOf(names, { program, args });
    return problem === undefined ? undefined : { what: "command", problem };
  }
  return undefined;
}

function resolvesToInternalModule(file: string, specifier: string): boolean {
  const normalized = specifier.startsWith("#/")
    ? posix.normalize(specifier.slice(2))
    : specifier.startsWith(".")
      ? posix.normalize(posix.join(posix.dirname(file.replaceAll("\\", "/")), specifier))
      : specifier;
  return normalized.replace(/\.(?:mts|mjs|ts|js)$/, "") === internalModuleStem;
}

function publicFacadeProblemsIn(source: ts.SourceFile, file: string): string[] {
  const problems: string[] = [];
  for (const [name, expected] of Object.entries(publicArities)) {
    const declarations = source.statements.filter(
      (statement): statement is ts.FunctionDeclaration =>
        ts.isFunctionDeclaration(statement) &&
        isExported(statement) &&
        statement.name?.text === name,
    );
    if (declarations.length === 0) {
      problems.push(`${file}: must export function ${name} with ${expected} parameters.`);
      continue;
    }
    const invalid = declarations.some(
      (declaration) =>
        declaration.parameters.length !== expected ||
        declaration.parameters.some((parameter) => parameter.dotDotDotToken !== undefined),
    );
    if (invalid) {
      problems.push(`${file}: ${name} must take exactly ${expected} parameters and nothing else.`);
    }
  }
  for (const statement of source.statements) {
    if (ts.isExportAssignment(statement)) {
      problems.push(`${file}: must not export default or export = from the public facade.`);
      continue;
    }
    if (ts.isExportDeclaration(statement)) {
      if (statement.exportClause === undefined || !ts.isNamedExports(statement.exportClause)) {
        problems.push(`${file}: must not wildcard-re-export from the public facade.`);
        continue;
      }
      for (const element of statement.exportClause.elements) {
        const exported = (element.propertyName ?? element.name).text;
        if (!allowedPublicReExports.has(exported)) {
          problems.push(`${file}: must not re-export ${exported} from the public facade.`);
        }
      }
      continue;
    }
    if (isExported(statement)) {
      const allowed =
        ts.isFunctionDeclaration(statement) &&
        statement.name !== undefined &&
        Object.hasOwn(publicArities, statement.name.text);
      if (!allowed) {
        problems.push(`${file}: exports a declaration beyond the public facade.`);
      }
    }
  }
  return problems;
}

function packageManagerCallProblemsIn(source: ts.SourceFile, file: string): string[] {
  const nodes = descendants(source);
  const names = namesIn(source, nodes);
  const lineOf = (node: ts.Node) => source.getLineAndCharacterOfPosition(node.getStart()).line + 1;
  const imports = mayImportTheInternalModule.includes(file)
    ? []
    : nodes.flatMap((node) => {
        const specifier = moduleSpecifierOf(node);
        return specifier !== undefined &&
          ts.isStringLiteralLikeNode(specifier) &&
          resolvesToInternalModule(file, specifier.text)
          ? [
              `${file}:${lineOf(node)}: imports ${internalModule}; only ${mayImportTheInternalModule.join(" and ")} do, so every question to the package manager goes through askPackageManager.`,
            ]
          : [];
      });
  const runs = nodes.flatMap((node) => {
    const found = runsIn(names, node);
    return found === undefined ? [] : [`${file}:${lineOf(node)}: ${found.what} ${found.problem}.`];
  });
  const facade = file === publicModule ? publicFacadeProblemsIn(source, file) : [];
  return [...imports, ...runs, ...facade];
}

test("no script or test asks the package manager itself or runs a vp but the repository's own: a question goes through askPackageManager, which alone imports the internal module, and every other run uses installedVp", () => {
  const files = [...scriptFiles, ...scriptFilesInDotDirectories].filter((file) =>
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
    "a quoted shell command through installedVp",
    'execSync(`"${installedVp}" why solid-js`);',
    "execSync runs vp why itself",
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
  [
    "a shorthand command property",
    'const command = [installedVp, "why"];\nstartServer({ command });',
    "command runs vp why itself",
  ],
  [
    "a string-keyed command property",
    'startServer({ "command": [installedVp, "why"] });',
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
    "a subpath import of the internal module with a dot segment",
    'import { askWith } from "#/scripts/./package-manager.internal.ts";\naskWith(seam, ["why"], options);',
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
    "a require of the internal module",
    'require("#/scripts/package-manager.internal.ts");',
    `imports ${internalModule}`,
  ],
  [
    "an import type of the internal module",
    'type S = import("#/scripts/package-manager.internal.ts").Seam;',
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
  ["a bare vp shell command", 'execSync("cd sub && vp");', "execSync runs vp from PATH"],
  [
    "a const alias of a child_process namespace import",
    'import cp from "node:child_process";\nconst runner = cp;\nrunner.execFileSync("vp", ["why"]);',
    "execFileSync runs vp why itself",
  ],
  [
    "a shell template interpolating a const alias of installedVp",
    "const local = installedVp;\nexecSync(`${local} why`);",
    "execSync runs vp why itself",
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

test("the package-manager rule lets the public module and its test import the internal one, and holds the public facade's surface and parameter counts", () => {
  const validFacadeLines = [
    'import { askWith } from "#/scripts/package-manager.internal.ts";',
    "export function installedVitePlusVersion() { return undefined; }",
    "export function askPackageManager(args: readonly string[], options: object) { return askWith(args, options); }",
  ];
  const validFacade = parseText(`${validFacadeLines.join("\n")}\n`, ".ts");

  for (const file of mayImportTheInternalModule) {
    expect(packageManagerCallProblemsIn(validFacade, file)).toEqual([]);
  }

  for (const [code, problem] of [
    [
      "export function installedVitePlusVersion() { return undefined; }\nexport function askPackageManager(a: unknown, b: unknown, seam?: unknown) {}",
      "askPackageManager must take exactly 2 parameters and nothing else.",
    ],
    [
      "export function installedVitePlusVersion() { return undefined; }\nexport function askPackageManager(a: unknown, ...rest: unknown[]) {}",
      "askPackageManager must take exactly 2 parameters and nothing else.",
    ],
    [
      [
        "export function installedVitePlusVersion() { return undefined; }",
        "export function askPackageManager(a: unknown, b: unknown): string;",
        "export function askPackageManager(a: unknown, b: unknown, seam?: unknown): string;",
        'export function askPackageManager(a: unknown, b: unknown, seam?: unknown) { return ""; }',
      ].join("\n"),
      "askPackageManager must take exactly 2 parameters and nothing else.",
    ],
    [
      `${validFacadeLines.join("\n")}\nexport { askWith } from "#/scripts/package-manager.internal.ts";`,
      "must not re-export askWith from the public facade.",
    ],
    [
      `${validFacadeLines.join("\n")}\nexport { askWith as run } from "#/scripts/package-manager.internal.ts";`,
      "must not re-export askWith from the public facade.",
    ],
    [
      `${validFacadeLines.join("\n")}\nexport * from "#/scripts/package-manager.internal.ts";`,
      "must not wildcard-re-export from the public facade.",
    ],
    [
      `${validFacadeLines.join("\n")}\nexport const leak = askWith;`,
      "exports a declaration beyond the public facade.",
    ],
    [
      `${validFacadeLines.join("\n")}\nexport default askWith;`,
      "must not export default or export = from the public facade.",
    ],
  ] as const) {
    const problems = packageManagerCallProblemsIn(parseText(`${code}\n`, ".ts"), publicModule);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain(problem);
  }

  const reExportedVersionProblems = packageManagerCallProblemsIn(
    parseText(
      'export { installedVitePlusVersion } from "#/scripts/package-manager.internal.ts";\nexport function askPackageManager(a: unknown, b: unknown) {}\n',
      ".ts",
    ),
    publicModule,
  );
  expect(reExportedVersionProblems).toEqual(
    expect.arrayContaining([
      expect.stringContaining("must export function installedVitePlusVersion with 0 parameters."),
      expect.stringContaining(
        "must not re-export installedVitePlusVersion from the public facade.",
      ),
    ]),
  );
});
