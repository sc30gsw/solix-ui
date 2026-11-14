import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, join, relative } from "node:path";
import ts from "typescript";
import { expect, test } from "vite-plus/test";
import { primitiveLibraries, repositoryRoot } from "./support/workspace";

const primitiveFile = /^create(?:-[a-z0-9]+)+\.ts$/;
const internalFile = /^internal(?:-[a-z0-9]+)+\.ts$/;
const typesFile = "types.ts";
const barrelFile = "index.ts";
const serverRenderTest = "tests/server-render.test.ts";
const browserTestSuffix = ".browser.test.ts";
const effectsThatRunOnTheServer = ["createRenderEffect", "createTrackedEffect"];
const styleAndClassMembers = ["style", "className", "classList", "attributeStyleMap"];
const styleAndClassAttributes = ["class", "style"];
const attributeWriters = ["setAttribute", "toggleAttribute", "removeAttribute", "setAttributeNS"];

type Module = { file: string; path: string; source: ts.SourceFile };

const libraries = primitiveLibraries.map(({ directory, manifest }) => {
  const source = join(directory, "src");
  const modules = readdirSync(source)
    .filter((entry) => entry.endsWith(".ts"))
    .sort()
    .map((file) => ({ file, path: join(source, file), source: parse(join(source, file)) }));
  return { name: manifest.name ?? directory, directory, source, modules };
});

const modules = libraries.flatMap((library) => library.modules);
const primitives = modules.filter(({ file }) => primitiveFile.test(file));

function parse(path: string): ts.SourceFile {
  return ts.createSourceFile(path, readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true);
}

function where(module: Module, node?: ts.Node): string {
  const file = relative(repositoryRoot, module.path);
  if (!node) return file;
  return `${file}:${module.source.getLineAndCharacterOfPosition(node.getStart()).line + 1}`;
}

function descendants(node: ts.Node): ts.Node[] {
  const found: ts.Node[] = [];
  const visit = (child: ts.Node): void => {
    found.push(child);
    ts.forEachChild(child, visit);
  };
  ts.forEachChild(node, visit);
  return found;
}

function functionNameFor(file: string): string {
  return basename(file, ".ts").replace(/-([a-z0-9])/g, (_match, letter: string) =>
    letter.toUpperCase(),
  );
}

function isExported(statement: ts.Statement): boolean {
  return ts.canHaveModifiers(statement)
    ? (ts.getModifiers(statement)?.some(({ kind }) => kind === ts.SyntaxKind.ExportKeyword) ??
        false)
    : false;
}

type Exports = { functions: string[]; types: string[]; others: string[] };

function exportsOf(source: ts.SourceFile): Exports {
  const found: Exports = { functions: [], types: [], others: [] };
  for (const statement of source.statements) {
    if (ts.isExportDeclaration(statement) || ts.isExportAssignment(statement)) {
      found.others.push(statement.getText().split("\n")[0]);
    } else if (isExported(statement)) {
      if (ts.isFunctionDeclaration(statement) && statement.name) {
        if (!found.functions.includes(statement.name.text))
          found.functions.push(statement.name.text);
      } else if (ts.isTypeAliasDeclaration(statement) || ts.isInterfaceDeclaration(statement)) {
        found.types.push(statement.name.text);
      } else {
        found.others.push(statement.getText().split("\n")[0]);
      }
    }
  }
  return found;
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

function unwrapped(expression: ts.Expression): ts.Expression {
  if (ts.isParenthesizedExpression(expression) || ts.isSatisfiesExpression(expression))
    return unwrapped(expression.expression);
  if (ts.isAsExpression(expression) && expression.type.getText() !== "const")
    return unwrapped(expression.expression);
  return expression;
}

function mutableAtModuleLevel(declaration: ts.VariableDeclaration): string | undefined {
  const list = declaration.parent;
  if (ts.isVariableDeclarationList(list) && (list.flags & ts.NodeFlags.Const) === 0) {
    return "a module-level let or var";
  }
  const value = declaration.initializer && unwrapped(declaration.initializer);
  if (!value) return undefined;
  if (ts.isNewExpression(value)) return `a module-level ${value.expression.getText()}`;
  if (ts.isCallExpression(value)) return `a module-level call to ${value.expression.getText()}`;
  if (ts.isArrayLiteralExpression(value)) return "a module-level array that is not as const";
  if (ts.isObjectLiteralExpression(value)) return "a module-level object that is not as const";
  return undefined;
}

function parametersOf(node: ts.Node): ts.ParameterDeclaration[] {
  return ts.isFunctionLike(node) ? [...node.parameters] : [];
}

function argumentsInScope(node: ts.Node): string[] {
  const names: string[] = [];
  for (let parent = node.parent; parent; parent = parent.parent) {
    if (!isModuleLevelFunction(parent)) continue;
    for (const parameter of parametersOf(parent)) {
      if (ts.isIdentifier(parameter.name)) names.push(parameter.name.text);
    }
  }
  return names;
}

function rootIdentifier(expression: ts.Expression): string | undefined {
  const value = unwrapped(expression);
  if (ts.isIdentifier(value)) return value.text;
  if (ts.isPropertyAccessExpression(value) || ts.isElementAccessExpression(value))
    return rootIdentifier(value.expression);
  if (ts.isNonNullExpression(value)) return rootIdentifier(value.expression);
  if (
    ts.isBinaryExpression(value) &&
    (value.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken ||
      value.operatorToken.kind === ts.SyntaxKind.BarBarToken)
  ) {
    return rootIdentifier(value.left);
  }
  return undefined;
}

function isModuleLevelFunction(node: ts.Node): boolean {
  if (ts.isFunctionDeclaration(node)) return ts.isSourceFile(node.parent);
  if (!ts.isArrowFunction(node) && !ts.isFunctionExpression(node)) return false;
  const holder = node.parent;
  return (
    ts.isVariableDeclaration(holder) &&
    ts.isVariableDeclarationList(holder.parent) &&
    ts.isVariableStatement(holder.parent.parent) &&
    ts.isSourceFile(holder.parent.parent.parent)
  );
}

function destructuredArguments(module: Module): string[] {
  return descendants(module.source).flatMap((node) => {
    if (isModuleLevelFunction(node)) {
      return parametersOf(node)
        .filter((parameter) => !ts.isIdentifier(parameter.name))
        .map(
          (parameter) =>
            `${where(module, parameter)}: the parameter ${parameter.name.getText()} is destructured. Name it, such as options, and read options.x where it is used, so an accessor or a getter in it stays live.`,
        );
    }
    if (
      ts.isVariableDeclaration(node) &&
      !ts.isIdentifier(node.name) &&
      node.initializer &&
      argumentsInScope(node).includes(rootIdentifier(node.initializer) ?? "")
    ) {
      return [
        `${where(module, node)}: ${node.getText()} destructures an argument. Read argument.x where it is used, so an accessor or a getter in it stays live.`,
      ];
    }
    if (
      ts.isSpreadAssignment(node) &&
      argumentsInScope(node).includes(rootIdentifier(node.expression) ?? "")
    ) {
      return [
        `${where(module, node)}: ${node.getText()} copies an argument. Read argument.x where it is used, so an accessor or a getter in it stays live.`,
      ];
    }
    return [];
  });
}

function writesStyleOrClass(module: Module): string[] {
  return descendants(module.source).flatMap((node) => {
    if (
      (ts.isPropertyAccessExpression(node) && styleAndClassMembers.includes(node.name.text)) ||
      (ts.isElementAccessExpression(node) &&
        ts.isStringLiteralLike(node.argumentExpression) &&
        styleAndClassMembers.includes(node.argumentExpression.text))
    ) {
      return [`${where(module, node)}: ${node.getText()}`];
    }
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      attributeWriters.includes(node.expression.name.text) &&
      node.arguments.some(
        (argument) =>
          ts.isStringLiteralLike(argument) &&
          styleAndClassAttributes.includes(argument.text.toLowerCase()),
      )
    ) {
      return [`${where(module, node)}: ${node.getText()}`];
    }
    return [];
  });
}

test("the primitives library has primitives to check", () => {
  expect(libraries.length).toBeGreaterThan(0);
  expect(primitives.length).toBeGreaterThan(0);
});

test("every source file of a primitives library is a primitive, an internal helper, the types or the barrel", () => {
  const violations = modules
    .filter(
      ({ file }) =>
        !primitiveFile.test(file) &&
        !internalFile.test(file) &&
        file !== typesFile &&
        file !== barrelFile,
    )
    .map(
      (module) =>
        `${where(module)}: name a primitive create-<name>.ts, a helper that no consumer imports internal-<topic>.ts, and put shared types in ${typesFile}.`,
    );
  const elsewhere = libraries.flatMap(({ source }) =>
    readdirSync(source)
      .filter((entry) => !entry.endsWith(".ts"))
      .map(
        (entry) => `${relative(repositoryRoot, join(source, entry))}: write it as a .ts module.`,
      ),
  );

  expect([...violations, ...elsewhere]).toEqual([]);
});

test("every primitive file exports one function, named for the file, and its types", () => {
  const violations = [
    ...primitives.flatMap((module) => {
      const expected = functionNameFor(module.file);
      const { functions, others } = exportsOf(module.source);
      return functions.join() === expected && others.length === 0
        ? []
        : [
            `${where(module)}: export exactly one function, ${expected}, named for the file, and types (found: ${[...functions, ...others].join(", ") || "nothing"}). Give a second function its own file, or name the file internal-<topic>.ts if no consumer should import it.`,
          ];
    }),
    ...modules
      .filter(({ file }) => file === typesFile)
      .flatMap((module) => {
        const { functions, others } = exportsOf(module.source);
        return [...functions, ...others].map(
          (name) => `${where(module)}: export only types from ${typesFile}, not ${name}.`,
        );
      }),
  ];

  expect(violations).toEqual([]);
});

test("the barrel re-exports every primitive with its types, then the shared types, in file order, and nothing internal", () => {
  for (const library of libraries) {
    const exported = library.modules.filter(
      ({ file }) => primitiveFile.test(file) || file === typesFile,
    );
    const barrel = library.modules.find(({ file }) => file === barrelFile);

    expect(
      barrel ? barrelLinesIn(barrel.source) : [],
      `${relative(repositoryRoot, join(library.source, barrelFile))}: re-export each primitive and its types, then ${typesFile}, sorted by file name, and no internal-* module`,
    ).toEqual(exported.map(barrelLine));
  }
});

test("no primitive calls an effect that runs on the server", () => {
  const violations = modules.flatMap((module) =>
    descendants(module.source)
      .filter(
        (node): node is ts.Identifier =>
          ts.isIdentifier(node) && effectsThatRunOnTheServer.includes(node.text),
      )
      .map(
        (node) =>
          `${where(module, node)}: ${node.text} runs on the server or not at all there, so a primitive would touch the DOM during server rendering or create different reactive nodes on each side. Attach in the apply of a createEffect, which the server never runs.`,
      ),
  );

  expect(violations).toEqual([]);
});

test("no primitive keeps mutable state at module level", () => {
  const violations = modules.flatMap((module) =>
    module.source.statements
      .filter(ts.isVariableStatement)
      .flatMap((statement) => [...statement.declarationList.declarations])
      .flatMap((declaration) => {
        const found = mutableAtModuleLevel(declaration);
        return found === undefined
          ? []
          : [
              `${where(module, declaration)}: ${found}. Module-level state is shared by every request on the server and every instance in the browser. Keep the state inside the primitive, and write a constant as a primitive value or with as const.`,
            ];
      }),
  );

  expect(violations).toEqual([]);
});

test("no primitive destructures or copies its arguments", () => {
  expect(modules.flatMap(destructuredArguments)).toEqual([]);
});

test("no primitive writes a style or a class", () => {
  const violations = modules
    .flatMap(writesStyleOrClass)
    .map(
      (found) =>
        `${found}: a primitive writes no style and no class. Return the state, and let the component that renders the element style it, so a consumer's class and style keep their precedence.`,
    );

  expect(violations).toEqual([]);
});

test("every primitive has a browser test named for it", () => {
  const violations = libraries.flatMap(({ directory, modules: own }) =>
    own
      .filter(({ file }) => primitiveFile.test(file))
      .map(({ file }) => join(directory, "tests", `${basename(file, ".ts")}${browserTestSuffix}`))
      .filter((path) => !existsSync(path))
      .map(
        (path) =>
          `${relative(repositoryRoot, path)}: add a browser test for this primitive. Every primitive has one, run in each engine with the harness in tests/support.`,
      ),
  );

  expect(violations).toEqual([]);
});

test("every primitives library has a server-render test", () => {
  const violations = libraries
    .map(({ directory }) => join(directory, serverRenderTest))
    .filter((path) => !existsSync(path))
    .map(
      (path) =>
        `${relative(repositoryRoot, path)}: add the server-render test, with a case for every primitive the barrel exports.`,
    );

  expect(violations).toEqual([]);
});
