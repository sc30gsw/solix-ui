import { existsSync, readdirSync } from "node:fs";
import { basename, join, relative } from "node:path";
import {
  descendants,
  exportsOf,
  findAncestor,
  modifierFlags,
  openProgram,
  parseAll,
  stringLiteralTypesOf,
  ts,
} from "../../scripts/syntax";
import { repositoryRoot } from "./workspace";

const kebabCaseModule = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*\.ts$/;
const internalModule = /^internal(?:-[a-z0-9]+)+\.ts$/;
const typesModule = "types.ts";
const barrelModule = "index.ts";
const primitivePrefix = "create-";
const serverRenderTest = "server-render.test.ts";
const browserTestSuffixes = [".browser.test.ts", ".browser.test.tsx"];
const nodeTestSuffixes = [".test.ts", ".test.tsx"];
const valueModule = "./internal-value";
const browserHarness = "./support/browser-harness";
const solidModule = "solid-js";
const flushName = "flush";
const accessibilityModule = "./support/accessibility";
const axeAssertion = "expectNoAxeViolations";
const focusMethod = "focus";
const focusMover = "moveFocus";
const focusModule = "internal-focus.ts";
const attachmentHelper = "createElementAttachment";
const attachmentModule = "internal-attachment.ts";
const refSetterType = "RefSetter";
const effectsAnElementPrimitiveLeavesToTheHelper = ["createEffect", "createMemo"];
const serverBranches = ["window", "document"];
const serverFlag = "isServer";
const modelRun = "modelRun";
const readOnceName = /^(?:initial|default|final)(?:[A-Z]|$)/;
const readOnceType = "ReadOnce";
const readOnceAccess = "accessUntracked";
const callsAllowedAtModuleLevel = ["Symbol", "Object.freeze"];
const effectsAPrimitiveAvoids: Record<string, string> = {
  createRenderEffect:
    "runs its effect function on the server too, during the render, so a primitive would touch the DOM there",
  createTrackedEffect:
    "is deprecated: it tracks and runs its side effect in one scope, which may run more than once for one change",
};
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
type Module = { file: string; path: string; source: ts.SourceFile };
type ModuleLevelFunction = ts.FunctionDeclaration | ts.ArrowFunction | ts.FunctionExpression;
type ImportedName = { imported: string; local: string; node: ts.ImportSpecifier };
type Import = { specifier: string; names: ImportedName[]; node: ts.ImportDeclaration };

export type Library = {
  source: string;
  testDirectory: string;
  entries: string[];
  modules: Module[];
  tests: Map<string, ts.SourceFile>;
  checker: ts.Checker;
  dispose: () => void;
};

export type Rule = (library: Library) => string[];

function entriesOf(directory: string): string[] {
  return existsSync(directory) ? readdirSync(directory).sort() : [];
}

export function loadLibrary(directory: string): Library {
  const source = join(directory, "src");
  const testDirectory = join(directory, "tests");
  const entries = entriesOf(source);
  const paths = entries
    .filter((entry) => entry.endsWith(".ts"))
    .map((entry) => join(source, entry));
  const program = openProgram(paths);
  const testEntries = entriesOf(testDirectory).filter((entry) => /\.tsx?$/.test(entry));
  const testSources = parseAll(testEntries.map((entry) => join(testDirectory, entry)));
  const tests = new Map(testEntries.map((entry, index) => [entry, testSources[index]]));
  const modules = paths.flatMap((path) => {
    const parsed = program.sourceFile(path);
    return parsed ? [{ file: basename(path), path, source: parsed }] : [];
  });
  return {
    source,
    testDirectory,
    entries,
    modules,
    tests,
    checker: program.checker,
    dispose: program.dispose,
  };
}

function at(module: Module, node?: ts.Node): string {
  const file = relative(repositoryRoot, module.path);
  if (!node) return file;
  return `${file}:${module.source.getLineAndCharacterOfPosition(node.getStart()).line + 1}`;
}

function testAt(library: Library, file: string, source: ts.SourceFile, node?: ts.Node): string {
  const path = relative(repositoryRoot, join(library.testDirectory, file));
  if (!node) return path;
  return `${path}:${source.getLineAndCharacterOfPosition(node.getStart()).line + 1}`;
}

function isInternal(file: string): boolean {
  return internalModule.test(file);
}

function isPublic(file: string): boolean {
  return (
    kebabCaseModule.test(file) && !isInternal(file) && file !== typesModule && file !== barrelModule
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

export function importsOf(source: ts.SourceFile): Import[] {
  return source.statements.flatMap((statement) => {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) {
      return [];
    }
    const bindings = statement.importClause?.namedBindings;
    const names =
      bindings && ts.isNamedImports(bindings)
        ? bindings.elements.map((element) => ({
            imported: (element.propertyName ?? element.name).text,
            local: element.name.text,
            node: element,
          }))
        : [];
    return [{ specifier: statement.moduleSpecifier.text, names, node: statement }];
  });
}

function unwrapped(expression: ts.Expression): ts.Expression {
  return ts.isParenthesizedExpression(expression) ||
    ts.isSatisfiesExpression(expression) ||
    ts.isNonNullExpression(expression) ||
    ts.isTypeAssertion(expression) ||
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
    if (!ts.isSignatureDeclaration(node) && !ts.isClassLikeDeclaration(node))
      node.forEachChild(visit);
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
  return stringLiteralTypesOf(library.checker, expression);
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

function isCallTo(node: ts.Node, name: string): node is ts.CallExpression {
  return (
    ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === name
  );
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
          (ts.isIdentifier(node) && Object.hasOwn(effectsAPrimitiveAvoids, node.text)) ||
          (ts.isElementAccessExpression(node) &&
            stringsIn(library, node.argumentExpression).some((name) =>
              Object.hasOwn(effectsAPrimitiveAvoids, name),
            )),
      )
      .map((node) => {
        const name = ts.isElementAccessExpression(node)
          ? (stringsIn(library, node.argumentExpression).find((found) =>
              Object.hasOwn(effectsAPrimitiveAvoids, found),
            ) ?? "")
          : node.getText();
        return `${at(module, node)}: ${node.getText()}: ${name} ${effectsAPrimitiveAvoids[name]}. Put a primitive's side effect in the apply of a createEffect, which runs only in the browser.`;
      }),
  );

const serverBranchesAvoided: Rule = (library) =>
  library.modules.flatMap((module) =>
    descendants(module.source)
      .filter(
        (node) =>
          (ts.isIdentifier(node) && node.text === serverFlag) ||
          (ts.isTypeOfExpression(node) &&
            ts.isIdentifier(unwrapped(node.expression)) &&
            serverBranches.includes(unwrapped(node.expression).getText())),
      )
      .map(
        (node) =>
          `${at(module, node)}: ${node.getText()}: a primitive creates the same reactive nodes on the server and in the browser, so it never asks where it runs. Read a browser global only in an effect's apply or a handler, which the server never runs.`,
      ),
  );

function stateIn(initializer: ts.Expression): ts.Node[] {
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
          for (const node of stateIn(initializer)) {
            found.push([node, `${node.getText().split("\n")[0]} at module level`]);
          }
        }
      }
      if (ts.isClassDeclaration(statement)) {
        for (const member of statement.members) {
          const isStatic =
            ts.isClassStaticBlockDeclaration(member) ||
            (modifierFlags(member) & ts.ModifierFlags.Static) !== 0;
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
        .filter((node): node is ts.CallExpression => isCallTo(node, readOnceAccess))
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
        (node): node is ts.ParameterDeclaration | ts.PropertySignatureDeclaration =>
          (ts.isParameterDeclaration(node) || ts.isPropertySignatureDeclaration(node)) &&
          ts.isIdentifier(node.name),
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

function exportsAFunction(module: Module): boolean {
  return exportsOf(module.source).functions.length > 0;
}

const testsNamedForModules: Rule = (library) =>
  library.modules.flatMap((module) => {
    const stem = basename(module.file, ".ts");
    if (isPrimitive(module.file)) {
      return testNamed(library, module.file, browserTestSuffixes)
        ? []
        : [
            `${at(module)}: add a browser test, tests/${stem}${browserTestSuffixes[0]}, run in each engine with the harness in tests/support.`,
          ];
    }
    if (isPublic(module.file)) {
      return testNamed(library, module.file, nodeTestSuffixes)
        ? []
        : [
            `${at(module)}: add a Node test, tests/${stem}${nodeTestSuffixes[0]}, since a plain helper needs no browser.`,
          ];
    }
    if (!isInternal(module.file) || !exportsAFunction(module)) return [];
    return testNamed(library, module.file, [...browserTestSuffixes, ...nodeTestSuffixes])
      ? []
      : [
          `${at(module)}: it holds logic the primitives rely on, so add a test named for it: tests/${stem}${nodeTestSuffixes[0]} in Node, or tests/${stem}${browserTestSuffixes[0]} in each engine when it needs a browser.`,
        ];
  });

function importsFrom(module: Module, specifier: string): boolean {
  return importsOf(module.source).some((found) => found.specifier === specifier);
}

const modelTests: Rule = (library) =>
  publicModules(library)
    .filter((module) => importsFrom(module, valueModule))
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

const browserTestsUseTheHarness: Rule = (library) =>
  [...library.tests]
    .filter(([file]) => browserTestSuffixes.some((suffix) => file.endsWith(suffix)))
    .flatMap(([file, source]) => {
      const imports = importsOf(source);
      const harness = imports.some(({ specifier }) => specifier === browserHarness)
        ? []
        : [
            `${testAt(library, file, source)}: import ${browserHarness}, so this file's tests fail on a Solid diagnostic and on a listener, timer or observer left after dispose.`,
          ];
      const flushFromSolid = imports
        .filter(({ specifier }) => specifier === solidModule)
        .flatMap(({ names }) => names)
        .filter(({ imported }) => imported === flushName)
        .map(
          ({ node }) =>
            `${testAt(library, file, source, node)}: take ${flushName} from ${browserHarness}, not from ${solidModule}, so what a flush runs is attributed to the primitive.`,
        );
      return [...harness, ...flushFromSolid];
    });

function returnsARef(fn: ts.FunctionDeclaration): boolean {
  return (
    fn.type !== undefined &&
    ts.isTypeReferenceNode(fn.type) &&
    fn.type.typeName.getText() === refSetterType
  );
}

const elementAttachments: Rule = (library) =>
  publicModules(library).flatMap((module) => {
    const refFunctions = module.source.statements.filter(
      (statement): statement is ts.FunctionDeclaration =>
        ts.isFunctionDeclaration(statement) && returnsARef(statement),
    );
    if (refFunctions.length === 0) return [];
    const helper = `${attachmentHelper} in ${attachmentModule}`;
    const callsTheHelper = descendants(module.source).some((node) =>
      isCallTo(node, attachmentHelper),
    );
    const missing = callsTheHelper
      ? []
      : refFunctions
          .slice(-1)
          .map(
            (fn) =>
              `${at(module, fn.name ?? fn)}: ${fn.name?.text ?? "it"} returns a ${refSetterType}, so take its ref, its memo and its effect from ${helper}.`,
          );
    const ownEffects = importsOf(module.source)
      .filter(({ specifier }) => specifier === solidModule)
      .flatMap(({ names }) => names)
      .filter(({ imported }) => effectsAnElementPrimitiveLeavesToTheHelper.includes(imported))
      .map(
        ({ imported, node }) =>
          `${at(module, node)}: ${imported}: a module that returns a ${refSetterType} leaves its memo and its effect to ${helper}, which creates them the same way on the server and in the browser.`,
      );
    return [...missing, ...ownEffects];
  });

function declaresTheFocusMover(module: Module): boolean {
  return (
    module.file === focusModule &&
    module.source.statements.some(
      (statement) => ts.isFunctionDeclaration(statement) && statement.name?.text === focusMover,
    )
  );
}

const focusMovesThroughOneFunction: Rule = (library) =>
  library.modules.flatMap((module) =>
    descendants(module.source)
      .filter(
        (node): node is ts.CallExpression =>
          ts.isCallExpression(node) &&
          ts.isPropertyAccessExpression(node.expression) &&
          node.expression.name.text === focusMethod,
      )
      .filter((call) => {
        const owner = findAncestor(call, ts.isFunctionDeclaration);
        return !(declaresTheFocusMover(module) && owner?.name?.text === focusMover);
      })
      .map(
        (call) =>
          `${at(module, call)}: ${call.getText()}: move focus with ${focusMover} from ${focusModule}, which confirms the element took it and which the accessibility rule follows.`,
      ),
  );

function movesFocus(library: Library, module: Module, seen: ReadonlySet<string>): boolean {
  if (declaresTheFocusMover(module)) return true;
  return importsOf(module.source).some(({ specifier, names }) => {
    if (names.some(({ imported }) => imported === focusMover)) return true;
    const target = library.modules.find(({ file }) => `./${basename(file, ".ts")}` === specifier);
    return (
      target !== undefined &&
      isInternal(target.file) &&
      !seen.has(target.file) &&
      movesFocus(library, target, new Set([...seen, module.file]))
    );
  });
}

function awaitsTheAxeAssertion(test: ts.SourceFile): boolean {
  const imported = importsOf(test)
    .filter(({ specifier }) => specifier === accessibilityModule)
    .flatMap(({ names }) => names)
    .filter(({ imported: name }) => name === axeAssertion)
    .map(({ local }) => local);
  return descendants(test).some(
    (node) =>
      ts.isAwaitExpression(node) &&
      ts.isCallExpression(node.expression) &&
      ts.isIdentifier(node.expression.expression) &&
      imported.includes(node.expression.expression.text),
  );
}

const accessibilityTests: Rule = (library) =>
  publicModules(library)
    .filter((module) => movesFocus(library, module, new Set()))
    .filter((module) => {
      const browserTest = testNamed(library, module.file, browserTestSuffixes);
      return !(browserTest && awaitsTheAxeAssertion(browserTest));
    })
    .map(
      (module) =>
        `${at(module)}: it imports ${focusMover}, directly or through an internal module, so its browser test awaits ${axeAssertion} from ${relative(repositoryRoot, join(library.testDirectory, `${accessibilityModule}.ts`))} on the region it manages.`,
    );

const serverRenderTestExists: Rule = (library) => {
  const path = join(library.testDirectory, serverRenderTest);
  return library.tests.has(serverRenderTest)
    ? []
    : [
        `${relative(repositoryRoot, path)}: add the server-render test, with a case for every primitive the barrel exports.`,
      ];
};

export const primitiveRules = {
  sourceFileKinds: {
    description: "every source file of the primitives package is a kebab-case .ts module",
    rule: sourceFileKinds,
  },
  publicExports: {
    description:
      "every public module exports one function, named for the file, and its types, and types.ts exports only types",
    rule: publicExports,
  },
  barrelOrder: {
    description:
      "the barrel re-exports every public module with its types, then the shared types, in file order, and nothing internal",
    rule: barrelOrder,
  },
  serverEffects: {
    description: "no primitive names createRenderEffect or createTrackedEffect",
    rule: serverEffects,
  },
  serverBranches: {
    description: "no primitive reads isServer, or applies typeof to window or document",
    rule: serverBranchesAvoided,
  },
  moduleState: { description: "no primitive keeps state at module level", rule: moduleState },
  readOnceArguments: {
    description:
      "a primitive reads once, when it is created, only an argument named and typed as read once",
    rule: readOnceArguments,
  },
  argumentReads: {
    description: "no primitive destructures or copies its arguments when it is created",
    rule: argumentReads,
  },
  styleAndClassWrites: {
    description: "no primitive writes a style or a class",
    rule: styleAndClassWrites,
  },
  elementAttachments: {
    description:
      "every public module that returns a RefSetter calls createElementAttachment and imports no createEffect or createMemo",
    rule: elementAttachments,
  },
  focusMoves: {
    description: "every focus move goes through moveFocus in internal-focus.ts",
    rule: focusMovesThroughOneFunction,
  },
  testsNamedForModules: {
    description:
      "every primitive has a browser test named for it, every plain helper a Node test, and every internal module that exports a function a test of either kind",
    rule: testsNamedForModules,
  },
  modelTests: {
    description: "every primitive that keeps its state in internal-value has a model test",
    rule: modelTests,
  },
  accessibilityTests: {
    description:
      "every public module that imports moveFocus, directly or through an internal module, has a browser test that awaits expectNoAxeViolations from packages/primitives/tests/support/accessibility.ts",
    rule: accessibilityTests,
  },
  browserTestsUseTheHarness: {
    description: "every browser test imports the harness and flushes through it",
    rule: browserTestsUseTheHarness,
  },
  serverRenderTest: {
    description: "the primitives package has a server-render test",
    rule: serverRenderTestExists,
  },
} satisfies Record<string, { description: string; rule: Rule }>;

export type PrimitiveRuleName = keyof typeof primitiveRules;

export function publicModuleCount(library: Library): number {
  return publicModules(library).length;
}
