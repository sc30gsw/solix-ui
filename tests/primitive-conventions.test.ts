import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, dirname, join, relative } from "node:path";
import ts from "typescript";
import { expect, test } from "vite-plus/test";
import { descendants, exportsOf } from "./support/syntax";
import { primitivesPackage, repositoryRoot } from "./support/workspace";

const kebabCaseModule = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*\.ts$/;
const internalModule = /^internal(?:-[a-z0-9]+)+\.ts$/;
const typesModule = "types.ts";
const barrelModule = "index.ts";
const primitivePrefix = "create-";
const serverRenderTest = "server-render.test.ts";
const browserTestSuffixes = [".browser.test.ts", ".browser.test.tsx"];
const nodeTestSuffixes = [".test.ts", ".test.tsx"];
const valueModule = "./internal-value";
const modelRun = "modelRun";
const readOnceName = /^(?:initial|default|final)(?:[A-Z]|$)/;
const readOnceType = "ReadOnce";
const readOnceAccess = "accessUntracked";
const callsAllowedAtModuleLevel = ["Symbol", "Object.freeze"];
const effectsThatRunOnTheServer = ["createRenderEffect", "createTrackedEffect"];
const styleAndClassMembers = ["style", "className", "classList", "attributeStyleMap"];
const writersOf: Record<string, string[]> = {
  classList: ["add", "remove", "toggle", "replace"],
  style: ["setProperty", "removeProperty"],
  attributeStyleMap: ["set", "append", "delete", "clear"],
};
const attributeNameAt: Record<string, number> = {
  setAttribute: 0,
  toggleAttribute: 0,
  removeAttribute: 0,
  createAttribute: 0,
  setAttributeNS: 1,
  removeAttributeNS: 1,
  createAttributeNS: 1,
};
const elementNameAt: Record<string, number> = { createElement: 0, createElementNS: 1 };
const styleAndClassAttributes = ["class", "style"];
const styleElement = "style";
const adoptedStyleSheets = "adoptedStyleSheets";
const objectAssign = "Object.assign";
const flowsThrough = [
  ts.SyntaxKind.QuestionQuestionToken,
  ts.SyntaxKind.BarBarToken,
  ts.SyntaxKind.AmpersandAmpersandToken,
  ts.SyntaxKind.CommaToken,
];
const compilerOptions: ts.CompilerOptions = {
  target: ts.ScriptTarget.ESNext,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  lib: ["lib.esnext.d.ts", "lib.dom.d.ts"],
  types: [],
  strict: true,
  noEmit: true,
  skipLibCheck: true,
};

type Files = { list: (directory: string) => string[]; read: (path: string) => string | undefined };
type Module = { file: string; path: string; source: ts.SourceFile };
type Library = {
  source: string;
  entries: string[];
  modules: Module[];
  tests: Map<string, ts.SourceFile>;
  checker: ts.TypeChecker;
};
type Rule = (library: Library) => string[];
type ModuleLevelFunction = ts.FunctionDeclaration | ts.ArrowFunction | ts.FunctionExpression;

const filesOnDisk: Files = {
  list: (directory) => (existsSync(directory) ? readdirSync(directory) : []),
  read: (path) => (existsSync(path) ? readFileSync(path, "utf8") : undefined),
};

function loadLibrary(directory: string, files: Files): Library {
  const source = join(directory, "src");
  const testDirectory = join(directory, "tests");
  const entries = files.list(source).sort();
  const paths = entries
    .filter((entry) => entry.endsWith(".ts"))
    .map((entry) => join(source, entry));
  const host = ts.createCompilerHost(compilerOptions, true);
  const readFromHost = host.readFile.bind(host);
  const existsOnHost = host.fileExists.bind(host);
  host.readFile = (path) => files.read(path) ?? readFromHost(path);
  host.fileExists = (path) => files.read(path) !== undefined || existsOnHost(path);
  const program = ts.createProgram(paths, compilerOptions, host);
  const tests = new Map(
    files
      .list(testDirectory)
      .filter((entry) => /\.tsx?$/.test(entry))
      .map((entry): [string, ts.SourceFile] => [
        entry,
        ts.createSourceFile(
          entry,
          files.read(join(testDirectory, entry)) ?? "",
          ts.ScriptTarget.Latest,
          true,
        ),
      ]),
  );
  const modules = paths.flatMap((path) => {
    const parsed = program.getSourceFile(path);
    return parsed ? [{ file: basename(path), path, source: parsed }] : [];
  });
  return { source, entries, modules, tests, checker: program.getTypeChecker() };
}

function at(module: Module, node?: ts.Node): string {
  const file = relative(repositoryRoot, module.path);
  if (!node) return file;
  return `${file}:${module.source.getLineAndCharacterOfPosition(node.getStart()).line + 1}`;
}

function isPublic(file: string): boolean {
  return (
    kebabCaseModule.test(file) &&
    !internalModule.test(file) &&
    file !== typesModule &&
    file !== barrelModule
  );
}

function isPrimitive(file: string): boolean {
  return isPublic(file) && file.startsWith(primitivePrefix);
}

function functionNameFor(file: string): string {
  return basename(file, ".ts").replace(/-([a-z0-9])/g, (_match, letter: string) =>
    letter.toUpperCase(),
  );
}

function publicModules(library: Library): Module[] {
  return library.modules.filter(({ file }) => isPublic(file));
}

function testNamed(library: Library, file: string, suffixes: string[]): ts.SourceFile | undefined {
  return suffixes
    .map((suffix) => library.tests.get(`${basename(file, ".ts")}${suffix}`))
    .find((found) => found !== undefined);
}

function unwrapped(expression: ts.Expression): ts.Expression {
  return ts.isParenthesizedExpression(expression) ||
    ts.isSatisfiesExpression(expression) ||
    ts.isNonNullExpression(expression) ||
    ts.isTypeAssertionExpression(expression) ||
    ts.isAsExpression(expression)
    ? unwrapped(expression.expression)
    : expression;
}

function isAsConst(expression: ts.Expression): boolean {
  if (ts.isParenthesizedExpression(expression) || ts.isSatisfiesExpression(expression)) {
    return isAsConst(expression.expression);
  }
  return ts.isAsExpression(expression) && expression.type.getText() === "const";
}

function sourcesOf(expression: ts.Expression): ts.Identifier[] {
  const value = unwrapped(expression);
  if (ts.isIdentifier(value)) return [value];
  if (ts.isPropertyAccessExpression(value) || ts.isElementAccessExpression(value)) {
    return sourcesOf(value.expression);
  }
  if (ts.isBinaryExpression(value) && flowsThrough.includes(value.operatorToken.kind)) {
    return [...sourcesOf(value.left), ...sourcesOf(value.right)];
  }
  if (ts.isConditionalExpression(value)) {
    return [...sourcesOf(value.whenTrue), ...sourcesOf(value.whenFalse)];
  }
  return [];
}

function moduleLevelFunctions(module: Module): ModuleLevelFunction[] {
  return module.source.statements.flatMap((statement): ModuleLevelFunction[] => {
    if (ts.isFunctionDeclaration(statement)) return statement.body ? [statement] : [];
    if (!ts.isVariableStatement(statement)) return [];
    return statement.declarationList.declarations.flatMap(({ initializer }) =>
      initializer && (ts.isArrowFunction(initializer) || ts.isFunctionExpression(initializer))
        ? [initializer]
        : [],
    );
  });
}

function outsideClosures(root: ts.Node | undefined): ts.Node[] {
  const found: ts.Node[] = [];
  const visit = (node: ts.Node): void => {
    found.push(node);
    if (!ts.isFunctionLike(node) && !ts.isClassLike(node)) ts.forEachChild(node, visit);
  };
  if (root) visit(root);
  return found;
}

function readsAParameter(
  library: Library,
  fn: ModuleLevelFunction,
): (expression: ts.Expression) => boolean {
  const parameters = new Set(
    fn.parameters.flatMap((parameter) => {
      const symbol = ts.isIdentifier(parameter.name)
        ? library.checker.getSymbolAtLocation(parameter.name)
        : undefined;
      return symbol ? [symbol] : [];
    }),
  );
  return (expression) =>
    sourcesOf(expression).some((identifier) => {
      const symbol = library.checker.getSymbolAtLocation(identifier);
      return symbol !== undefined && parameters.has(symbol);
    });
}

function stringsIn(library: Library, expression: ts.Expression | undefined): string[] {
  if (!expression) return [];
  const type = library.checker.getTypeAtLocation(expression);
  return (type.isUnion() ? type.types : [type]).flatMap((part) =>
    part.isStringLiteral() ? [part.value] : [],
  );
}

function memberName(library: Library, expression: ts.Expression): string | undefined {
  if (ts.isPropertyAccessExpression(expression)) return expression.name.text;
  if (ts.isElementAccessExpression(expression)) {
    return stringsIn(library, expression.argumentExpression)[0];
  }
  return undefined;
}

function touchesStyleOrClass(library: Library, expression: ts.Expression): boolean {
  const value = unwrapped(expression);
  if (!ts.isPropertyAccessExpression(value) && !ts.isElementAccessExpression(value)) return false;
  return (
    styleAndClassMembers.includes(memberName(library, value) ?? "") ||
    touchesStyleOrClass(library, value.expression)
  );
}

function barrelLine(module: Module): string {
  const { functions, types } = exportsOf(module.source);
  const names = [...functions, ...types.sort().map((type) => `type ${type}`)];
  return `export { ${names.join(", ")} } from "./${basename(module.file, ".ts")}";`;
}

function barrelLinesIn(barrel: ts.SourceFile): string[] {
  return barrel.statements.map((statement) => {
    if (
      !ts.isExportDeclaration(statement) ||
      !statement.moduleSpecifier ||
      !ts.isStringLiteral(statement.moduleSpecifier) ||
      !statement.exportClause ||
      !ts.isNamedExports(statement.exportClause)
    ) {
      return statement.getText();
    }
    const names = statement.exportClause.elements.map((element) =>
      statement.isTypeOnly || element.isTypeOnly ? `type ${element.name.text}` : element.name.text,
    );
    return `export { ${names.join(", ")} } from "${statement.moduleSpecifier.text}";`;
  });
}

const sourceFileKinds: Rule = (library) =>
  library.entries
    .filter((entry) => !kebabCaseModule.test(entry))
    .map((entry) =>
      entry.endsWith(".ts")
        ? `${relative(repositoryRoot, join(library.source, entry))}: name a module in kebab-case: a public module such as create-<name>.ts or get-<name>.ts, a helper that no consumer imports internal-<topic>.ts, and the shared types ${typesModule}.`
        : `${relative(repositoryRoot, join(library.source, entry))}: write it as a .ts module.`,
    );

const publicExports: Rule = (library) => [
  ...publicModules(library).flatMap((module) => {
    const expected = functionNameFor(module.file);
    const { functions, others } = exportsOf(module.source);
    return functions.join() === expected && others.length === 0
      ? []
      : [
          `${at(module)}: export exactly one function, ${expected}, named for the file, and types (found: ${[...functions, ...others].join(", ") || "nothing"}). Give a second function its own file, or name the file internal-<topic>.ts if no consumer should import it.`,
        ];
  }),
  ...library.modules
    .filter(({ file }) => file === typesModule)
    .flatMap((module) => {
      const { functions, others } = exportsOf(module.source);
      return [...functions, ...others].map(
        (name) => `${at(module)}: export only types from ${typesModule}, not ${name}.`,
      );
    }),
];

const barrelOrder: Rule = (library) => {
  const exported = library.modules.filter(({ file }) => isPublic(file) || file === typesModule);
  const barrel = library.modules.find(({ file }) => file === barrelModule);
  const actual = barrel ? barrelLinesIn(barrel.source) : [];
  const expected = exported.map(barrelLine);
  return actual.join("\n") === expected.join("\n")
    ? []
    : [
        `${relative(repositoryRoot, join(library.source, barrelModule))}: re-export each public module and its types, then ${typesModule}, sorted by file name, and no internal-* module. Expected:\n${expected.join("\n")}`,
      ];
};

const serverEffects: Rule = (library) =>
  library.modules.flatMap((module) =>
    descendants(module.source)
      .filter(
        (node) =>
          (ts.isIdentifier(node) && effectsThatRunOnTheServer.includes(node.text)) ||
          (ts.isElementAccessExpression(node) &&
            stringsIn(library, node.argumentExpression).some((name) =>
              effectsThatRunOnTheServer.includes(name),
            )),
      )
      .map(
        (node) =>
          `${at(module, node)}: ${node.getText()} runs on the server or not at all there, so a primitive would touch the DOM during server rendering or create different reactive nodes on each side. Attach in the apply of a createEffect, which the server never runs.`,
      ),
  );

function stateIn(library: Library, initializer: ts.Expression): ts.Node[] {
  return outsideClosures(initializer).filter((node) => {
    if (ts.isNewExpression(node) || ts.isRegularExpressionLiteral(node)) return true;
    if (ts.isTaggedTemplateExpression(node)) return true;
    return (
      ts.isCallExpression(node) && !callsAllowedAtModuleLevel.includes(node.expression.getText())
    );
  });
}

const moduleState: Rule = (library) =>
  library.modules.flatMap((module) =>
    module.source.statements.flatMap((statement) => {
      const found: [ts.Node, string][] = [];
      if (ts.isVariableStatement(statement)) {
        if ((statement.declarationList.flags & ts.NodeFlags.Const) === 0) {
          found.push([statement, "a module-level let or var"]);
        }
        for (const { initializer } of statement.declarationList.declarations) {
          if (!initializer) continue;
          const value = unwrapped(initializer);
          if (
            !isAsConst(initializer) &&
            (ts.isArrayLiteralExpression(value) || ts.isObjectLiteralExpression(value))
          ) {
            found.push([initializer, "a module-level array or object that is not as const"]);
          }
          for (const node of stateIn(library, initializer)) {
            found.push([node, `${node.getText().split("\n")[0]} at module level`]);
          }
        }
      }
      if (ts.isClassDeclaration(statement)) {
        for (const member of statement.members) {
          const isStatic =
            ts.isClassStaticBlockDeclaration(member) ||
            (ts.canHaveModifiers(member) &&
              (ts.getModifiers(member)?.some(({ kind }) => kind === ts.SyntaxKind.StaticKeyword) ??
                false));
          if (isStatic && !ts.isMethodDeclaration(member)) {
            found.push([member, "a static class field"]);
          }
        }
      }
      return found.map(
        ([node, what]) =>
          `${at(module, node)}: ${what}. Module-level state is shared by every request on the server and every instance in the browser. Keep the state inside the primitive, and write a constant as a primitive value, Symbol(...), Object.freeze(...) or a literal with as const.`,
      );
    }),
  );

const readOnceArguments: Rule = (library) => [
  ...library.modules.flatMap((module) =>
    moduleLevelFunctions(module).flatMap((fn) => {
      const readsParameter = readsAParameter(library, fn);
      return outsideClosures(fn.body)
        .filter(
          (node): node is ts.CallExpression =>
            ts.isCallExpression(node) && node.expression.getText() === readOnceAccess,
        )
        .filter((call) => {
          const argument = call.arguments[0] && unwrapped(call.arguments[0]);
          if (!argument) return true;
          const name = ts.isIdentifier(argument)
            ? argument.text
            : ts.isPropertyAccessExpression(argument)
              ? argument.name.text
              : "";
          return !readOnceName.test(name) || !readsParameter(argument);
        })
        .map(
          (call) =>
            `${at(module, call)}: ${call.getText()} reads an argument once, when the primitive is created. Read once only a parameter or an option named initial*, default* or final*, and read a live option where it is used.`,
        );
    }),
  ),
  ...publicModules(library).flatMap((module) =>
    descendants(module.source)
      .filter(
        (node): node is ts.ParameterDeclaration | ts.PropertySignature =>
          (ts.isParameter(node) || ts.isPropertySignature(node)) && ts.isIdentifier(node.name),
      )
      .filter((node) => {
        const typedReadOnce =
          node.type !== undefined &&
          ts.isTypeReferenceNode(node.type) &&
          node.type.typeName.getText() === readOnceType;
        return typedReadOnce !== readOnceName.test(node.name.getText());
      })
      .map(
        (node) =>
          `${at(module, node)}: ${node.name.getText()} is ${readOnceName.test(node.name.getText()) ? "named" : "typed"} as read once but not ${readOnceName.test(node.name.getText()) ? "typed" : "named"} so. Type an argument read once ${readOnceType}<T> and name it initial*, default* or final*, and type a live one MaybeAccessor<T>.`,
      ),
  ),
];

const argumentReads: Rule = (library) =>
  library.modules.flatMap((module) =>
    moduleLevelFunctions(module).flatMap((fn) => {
      const readsParameter = readsAParameter(library, fn);
      const destructured = fn.parameters
        .filter((parameter) => !ts.isIdentifier(parameter.name))
        .map(
          (parameter) =>
            `${at(module, parameter)}: the parameter ${parameter.name.getText()} is destructured. Name it, such as options, and read options.x where it is used, so an accessor or a getter in it stays live.`,
        );
      const copies = outsideClosures(fn.body).flatMap((node) => {
        const copied =
          (ts.isVariableDeclaration(node) &&
            node.initializer !== undefined &&
            readsParameter(node.initializer)) ||
          ((ts.isSpreadElement(node) || ts.isSpreadAssignment(node)) &&
            readsParameter(node.expression)) ||
          (ts.isCallExpression(node) &&
            node.expression.getText() === objectAssign &&
            node.arguments.slice(1).some(readsParameter));
        return copied
          ? [
              `${at(module, node)}: ${node.getText().split("\n")[0]} copies an argument when the primitive is created. Read argument.x where it is used, so an accessor or a getter in it stays live.`,
            ]
          : [];
      });
      return [...destructured, ...copies];
    }),
  );

function writesStyleOrClass(library: Library, node: ts.Node): boolean {
  if (
    ts.isBinaryExpression(node) &&
    node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment &&
    node.operatorToken.kind <= ts.SyntaxKind.LastAssignment
  ) {
    return touchesStyleOrClass(library, node.left);
  }
  if (
    (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) &&
    memberName(library, node) === adoptedStyleSheets
  ) {
    return true;
  }
  if (!ts.isCallExpression(node)) return false;
  const callee = unwrapped(node.expression);
  if (callee.getText() === objectAssign) {
    return node.arguments[0] !== undefined && touchesStyleOrClass(library, node.arguments[0]);
  }
  if (!ts.isPropertyAccessExpression(callee)) return false;
  const method = callee.name.text;
  const owner = memberName(library, unwrapped(callee.expression)) ?? "";
  const nameIn = (position: number | undefined) =>
    position === undefined ? [] : stringsIn(library, node.arguments[position]);
  return (
    (writersOf[owner]?.includes(method) ?? false) ||
    nameIn(attributeNameAt[method]).some((name) =>
      styleAndClassAttributes.includes(name.toLowerCase()),
    ) ||
    nameIn(elementNameAt[method]).some((name) => name.toLowerCase() === styleElement)
  );
}

const styleAndClassWrites: Rule = (library) =>
  library.modules.flatMap((module) =>
    descendants(module.source)
      .filter((node) => writesStyleOrClass(library, node))
      .map(
        (node) =>
          `${at(module, node)}: ${node.getText().split("\n")[0]}: a primitive writes no style and no class. Return the state, and let the component that renders the element style it, so a consumer's class and style keep their precedence.`,
      ),
  );

const testsNamedForModules: Rule = (library) =>
  publicModules(library).flatMap((module) => {
    const [suffixes, kind] = isPrimitive(module.file)
      ? [
          browserTestSuffixes,
          "a browser test, run in each engine with the harness in tests/support",
        ]
      : [nodeTestSuffixes, "a Node test, since a plain helper needs no browser"];
    return testNamed(library, module.file, suffixes)
      ? []
      : [`${at(module)}: add ${kind}, tests/${basename(module.file, ".ts")}${suffixes[0]}.`];
  });

const modelTests: Rule = (library) =>
  publicModules(library)
    .filter((module) =>
      module.source.statements.some(
        (statement) =>
          ts.isImportDeclaration(statement) &&
          ts.isStringLiteral(statement.moduleSpecifier) &&
          statement.moduleSpecifier.text === valueModule,
      ),
    )
    .filter((module) => {
      const browserTest = testNamed(library, module.file, browserTestSuffixes);
      return !(
        browserTest &&
        descendants(browserTest).some(
          (node) =>
            ts.isCallExpression(node) &&
            ts.isPropertyAccessExpression(node.expression) &&
            node.expression.name.text === modelRun,
        )
      );
    })
    .map(
      (module) =>
        `${at(module)}: it keeps its state in ${valueModule}, so its browser test runs generated sequences of its commands against a model with fc.${modelRun}, built on tests/support/model.ts.`,
    );

const library = loadLibrary(primitivesPackage.directory, filesOnDisk);

test("the primitives package has public modules to check", () => {
  expect(publicModules(library).length).toBeGreaterThan(0);
});

test("every source file of the primitives package is a kebab-case .ts module", () => {
  expect(sourceFileKinds(library)).toEqual([]);
});

test("every public module exports one function, named for the file, and its types, and types.ts exports only types", () => {
  expect(publicExports(library)).toEqual([]);
});

test("the barrel re-exports every public module with its types, then the shared types, in file order, and nothing internal", () => {
  expect(barrelOrder(library)).toEqual([]);
});

test("no primitive calls an effect that runs on the server", () => {
  expect(serverEffects(library)).toEqual([]);
});

test("no primitive keeps state at module level", () => {
  expect(moduleState(library)).toEqual([]);
});

test("a primitive reads once, when it is created, only an argument named and typed as read once", () => {
  expect(readOnceArguments(library)).toEqual([]);
});

test("no primitive destructures or copies its arguments when it is created", () => {
  expect(argumentReads(library)).toEqual([]);
});

test("no primitive writes a style or a class", () => {
  expect(styleAndClassWrites(library)).toEqual([]);
});

test("every primitive has a browser test named for it, and every plain helper a Node test", () => {
  expect(testsNamedForModules(library)).toEqual([]);
});

test("every primitive that keeps its state in internal-value has a model test", () => {
  expect(modelTests(library)).toEqual([]);
});

test("the primitives package has a server-render test", () => {
  const path = join(primitivesPackage.directory, "tests", serverRenderTest);

  expect(
    existsSync(path),
    `${relative(repositoryRoot, path)}: add the server-render test, with a case for every primitive the barrel exports.`,
  ).toBe(true);
});

const fixtureDirectory = join(repositoryRoot, "fixture-primitives");

function fixtureLibrary(files: Record<string, string>): Library {
  const byPath = new Map(
    Object.entries(files).map(([path, text]) => [join(fixtureDirectory, path), text]),
  );
  return loadLibrary(fixtureDirectory, {
    list: (directory) =>
      [...byPath.keys()]
        .filter((path) => dirname(path) === directory)
        .map((path) => basename(path)),
    read: (path) => byPath.get(path),
  });
}

function located(files: Record<string, string>, file: string, snippet?: string): string {
  const path = relative(repositoryRoot, join(fixtureDirectory, file));
  if (snippet === undefined) return path;
  const lines = (files[file] ?? "").split("\n");
  const index = lines.findIndex((line) => line.includes(snippet));
  if (index === -1) throw new Error(`${file} holds no line with ${snippet}.`);
  return `${path}:${index + 1}`;
}

function locationsOf(violations: string[]): string[] {
  return violations.map((violation) => /^([^\s:]+(?::\d+)?):/.exec(violation)?.[1] ?? violation);
}

const sharedFixtureFiles: Record<string, string> = {
  "src/internal-access.ts": `export function accessUntracked<T>(value: T | (() => T)): T {
  return typeof value === "function" ? (value as () => T)() : value;
}
`,
  "src/internal-value.ts": `export function createValue<T>(initial: T) {
  return { get: () => initial };
}
`,
  "src/types.ts": `export type MaybeAccessor<T> = T | (() => T);
export type ReadOnce<T> = T | (() => T);
`,
};

const allowed: Record<string, string> = {
  ...sharedFixtureFiles,
  "src/create-allowed.ts": `import { accessUntracked } from "./internal-access";
import { createValue } from "./internal-value";
import type { MaybeAccessor, ReadOnce } from "./types";

const missing = Symbol("missing");
const empty = Object.freeze([]);
const limits = { lowest: 0, names: ["a"] } as const;

export type AllowedOptions = { max?: MaybeAccessor<number>; defaultLabel?: ReadOnce<string> };

export function createAllowed(
  initialValue: ReadOnce<number>,
  element: HTMLElement,
  options?: AllowedOptions,
) {
  const initial = accessUntracked(initialValue);
  const label = accessUntracked(options?.defaultLabel);
  const value = createValue(initial);
  const items = [...(accessUntracked(initialValue) > 0 ? [initial] : limits.names)];
  const copy = (options: { max: number }) => ({ ...options });
  const open = () => element.classList.contains("open") || element.style.display !== "none";
  const clamped = () => Math.min(value.get(), accessUntracked(options?.max ?? limits.lowest));
  return [value.get, open, clamped, () => [label, missing, empty, items], copy];
}
`,
  "src/get-hotkey-handler.ts": `export function getHotkeyHandler(hotkey: string): (event: KeyboardEvent) => boolean {
  return (event) => event.key === hotkey;
}
`,
  "src/index.ts": `export { createAllowed, type AllowedOptions } from "./create-allowed";
export { getHotkeyHandler } from "./get-hotkey-handler";
export type { MaybeAccessor, ReadOnce } from "./types";
`,
  "tests/create-allowed.browser.test.ts": `import fc from "fast-check";
fc.modelRun(() => ({ model: {}, real: {} }), []);
`,
  "tests/get-hotkey-handler.test.ts": `getHotkeyHandler("a");
`,
};

const forbidden: Record<string, string> = {
  ...sharedFixtureFiles,
  "src/GetThing.ts": `export function getThing() {
  return 1;
}
`,
  "src/notes.md": `notes
`,
  "src/get-other.ts": `export function getAnother() {
  return 1;
}
`,
  "src/create-modelled.ts": `import { createValue } from "./internal-value";

export function createModelled() {
  return createValue(0).get;
}
`,
  "src/create-forbidden.ts": `import * as solid from "solid-js";
import { createRenderEffect } from "solid-js";
import { accessUntracked } from "./internal-access";
import type { MaybeAccessor, ReadOnce } from "./types";

let instances = 0;
const cache = new Map<string, number>();
const made = String(instances);
const table = { lookup: new Map<string, number>() } as const;
const pattern = /open/g;
const list = [1, 2];
const effectName = "createTrackedEffect";
class Registry {
  static entries: number[] = [];
}

export type ForbiddenOptions = {
  step: MaybeAccessor<number>;
  list: number[];
  value: ReadOnce<number>;
  initialCount: MaybeAccessor<number>;
};

export function createForbidden(
  options: ForbiddenOptions,
  element: HTMLElement,
  { label }: { label: string },
) {
  const step = options.step;
  const alias = options;
  const { list: items } = options;
  const copied = Object.assign({}, options);
  const spread = [...options.list];
  const merged = { ...options };
  const max = accessUntracked(options.step);
  const attribute = "class";
  element.className = "open";
  element.style.color = "red";
  element.classList.add("open");
  element.style.setProperty("color", "red");
  Object.assign(element.style, { color: "red" });
  element.setAttribute("style", "color: red");
  element.setAttribute(attribute, "open");
  document.adoptedStyleSheets = [];
  document.createElement("style");
  createRenderEffect(() => undefined, () => undefined);
  solid["createRenderEffect"](() => undefined, () => undefined);
  solid[effectName](() => undefined);
  return () => [step, alias, items, copied, spread, merged, max, label, cache, made];
}
`,
  "src/index.ts": `export { createForbidden, type ForbiddenOptions } from "./create-forbidden";
export type { MaybeAccessor, ReadOnce } from "./types";
`,
  "tests/create-modelled.browser.test.ts": `import { createModelled } from "../src/create-modelled";
createModelled();
`,
};

const rules: Record<string, Rule> = {
  sourceFileKinds,
  publicExports,
  barrelOrder,
  serverEffects,
  moduleState,
  readOnceArguments,
  argumentReads,
  styleAndClassWrites,
  testsNamedForModules,
  modelTests,
};

const forbiddenAt = (file: string, snippet?: string) => located(forbidden, file, snippet);

const forbiddenFindings: Record<string, string[]> = {
  sourceFileKinds: [forbiddenAt("src/GetThing.ts"), forbiddenAt("src/notes.md")],
  publicExports: [forbiddenAt("src/get-other.ts")],
  barrelOrder: [forbiddenAt("src/index.ts")],
  serverEffects: [
    forbiddenAt("src/create-forbidden.ts", "import { createRenderEffect }"),
    forbiddenAt("src/create-forbidden.ts", "  createRenderEffect("),
    forbiddenAt("src/create-forbidden.ts", 'solid["createRenderEffect"]'),
    forbiddenAt("src/create-forbidden.ts", "solid[effectName]"),
  ],
  moduleState: [
    forbiddenAt("src/create-forbidden.ts", "let instances"),
    forbiddenAt("src/create-forbidden.ts", "const cache"),
    forbiddenAt("src/create-forbidden.ts", "const made"),
    forbiddenAt("src/create-forbidden.ts", "const table"),
    forbiddenAt("src/create-forbidden.ts", "const pattern"),
    forbiddenAt("src/create-forbidden.ts", "const list"),
    forbiddenAt("src/create-forbidden.ts", "static entries"),
  ],
  readOnceArguments: [
    forbiddenAt("src/create-forbidden.ts", "const max"),
    forbiddenAt("src/create-forbidden.ts", "value: ReadOnce<number>"),
    forbiddenAt("src/create-forbidden.ts", "initialCount: MaybeAccessor<number>"),
  ],
  argumentReads: [
    forbiddenAt("src/create-forbidden.ts", "{ label }: { label: string }"),
    forbiddenAt("src/create-forbidden.ts", "const step"),
    forbiddenAt("src/create-forbidden.ts", "const alias"),
    forbiddenAt("src/create-forbidden.ts", "const { list: items }"),
    forbiddenAt("src/create-forbidden.ts", "Object.assign({}, options)"),
    forbiddenAt("src/create-forbidden.ts", "[...options.list]"),
    forbiddenAt("src/create-forbidden.ts", "{ ...options }"),
  ],
  styleAndClassWrites: [
    forbiddenAt("src/create-forbidden.ts", "element.className"),
    forbiddenAt("src/create-forbidden.ts", "element.style.color"),
    forbiddenAt("src/create-forbidden.ts", "element.classList.add"),
    forbiddenAt("src/create-forbidden.ts", "element.style.setProperty"),
    forbiddenAt("src/create-forbidden.ts", "Object.assign(element.style"),
    forbiddenAt("src/create-forbidden.ts", 'setAttribute("style"'),
    forbiddenAt("src/create-forbidden.ts", "setAttribute(attribute"),
    forbiddenAt("src/create-forbidden.ts", "adoptedStyleSheets"),
    forbiddenAt("src/create-forbidden.ts", 'createElement("style")'),
  ],
  testsNamedForModules: [forbiddenAt("src/create-forbidden.ts"), forbiddenAt("src/get-other.ts")],
  modelTests: [forbiddenAt("src/create-modelled.ts")],
};

test("each rule passes a fixture that holds only what it allows: read-once arguments, reads of a class or a style, Symbol and Object.freeze at module level, a plain helper with a Node test, and a shadowed parameter", () => {
  const fixture = fixtureLibrary(allowed);
  const findings = Object.fromEntries(
    Object.entries(rules).map(([name, rule]) => [name, rule(fixture)]),
  );

  expect(findings).toEqual(Object.fromEntries(Object.keys(rules).map((name) => [name, []])));
});

test("each rule flags every line of a fixture that breaks it, and nothing else", () => {
  const fixture = fixtureLibrary(forbidden);
  const findings = Object.fromEntries(
    Object.entries(rules).map(([name, rule]) => [name, locationsOf(rule(fixture)).sort()]),
  );
  const expected = Object.fromEntries(
    Object.entries(forbiddenFindings).map(([name, locations]) => [name, [...locations].sort()]),
  );

  expect(findings).toEqual(expected);
});
