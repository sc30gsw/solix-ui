import { readFileSync } from "node:fs";
import ts from "typescript";

export { ts };

export type Exports = { functions: string[]; types: string[]; others: string[] };

export function parse(file: string): ts.SourceFile {
  return ts.createSourceFile(
    file,
    readFileSync(file, "utf8"),
    ts.ScriptTarget.Latest,
    true,
    file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
}

export function descendants(node: ts.Node): ts.Node[] {
  const found: ts.Node[] = [];
  const visit = (child: ts.Node): void => {
    found.push(child);
    ts.forEachChild(child, visit);
  };
  ts.forEachChild(node, visit);
  return found;
}

export function isExported(statement: ts.Statement): boolean {
  return ts.canHaveModifiers(statement)
    ? (ts.getModifiers(statement)?.some(({ kind }) => kind === ts.SyntaxKind.ExportKeyword) ??
        false)
    : false;
}

export function exportsOf(source: ts.SourceFile): Exports {
  const found: Exports = { functions: [], types: [], others: [] };
  for (const statement of source.statements) {
    if (ts.isExportDeclaration(statement) || ts.isExportAssignment(statement)) {
      found.others.push(statement.getText().split("\n")[0]);
    } else if (!isExported(statement)) {
      continue;
    } else if (ts.isFunctionDeclaration(statement)) {
      const name = statement.name?.text ?? "<anonymous>";
      if (!found.functions.includes(name)) found.functions.push(name);
    } else if (ts.isTypeAliasDeclaration(statement) || ts.isInterfaceDeclaration(statement)) {
      found.types.push(statement.name.text);
    } else if (ts.isVariableStatement(statement)) {
      found.others.push(
        ...statement.declarationList.declarations.map((declaration) => declaration.name.getText()),
      );
    } else {
      found.others.push(statement.getText().split("\n")[0]);
    }
  }
  return found;
}

export type ImportedName = { imported: string; local: string; node: ts.ImportSpecifier };

export type Import = {
  specifier: string;
  names: ImportedName[];
  typeOnly: boolean;
  node: ts.ImportDeclaration;
};

const flowsThrough = [
  ts.SyntaxKind.QuestionQuestionToken,
  ts.SyntaxKind.BarBarToken,
  ts.SyntaxKind.AmpersandAmpersandToken,
  ts.SyntaxKind.CommaToken,
];

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
    return [
      {
        specifier: statement.moduleSpecifier.text,
        names,
        typeOnly: statement.importClause?.isTypeOnly ?? false,
        node: statement,
      },
    ];
  });
}

export function unwrapped(expression: ts.Expression): ts.Expression {
  return ts.isParenthesizedExpression(expression) ||
    ts.isSatisfiesExpression(expression) ||
    ts.isNonNullExpression(expression) ||
    ts.isTypeAssertionExpression(expression) ||
    ts.isAsExpression(expression)
    ? unwrapped(expression.expression)
    : expression;
}

export function isAsConst(expression: ts.Expression): boolean {
  if (ts.isParenthesizedExpression(expression) || ts.isSatisfiesExpression(expression)) {
    return isAsConst(expression.expression);
  }
  return ts.isAsExpression(expression) && expression.type.getText() === "const";
}

export function sourcesOf(expression: ts.Expression): ts.Identifier[] {
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

export function outsideClosures(root: ts.Node | undefined): ts.Node[] {
  const found: ts.Node[] = [];
  const visit = (node: ts.Node): void => {
    found.push(node);
    if (!ts.isFunctionLike(node) && !ts.isClassLike(node)) ts.forEachChild(node, visit);
  };
  if (root) visit(root);
  return found;
}

export function isCallTo(node: ts.Node, name: string): node is ts.CallExpression {
  return (
    ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === name
  );
}

export function isInTypePosition(node: ts.Node): boolean {
  return ts.findAncestor(node.parent, (ancestor) => ts.isTypeNode(ancestor)) !== undefined;
}

const packageFile = /[\\/]node_modules[\\/]/;
const domLibraryFile = /[\\/]typescript[\\/]lib[\\/]lib\.dom(?:\.[a-z]+)*\.d\.ts$/;
const defaultLibraryFile = /[\\/]typescript[\\/]lib[\\/]lib\.[^\\/]+\.d\.ts$/;
const globalObject = "globalThis";

const compilerOptions: ts.CompilerOptions = {
  target: ts.ScriptTarget.ESNext,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  lib: ["lib.esnext.d.ts", "lib.dom.d.ts", "lib.dom.iterable.d.ts"],
  jsx: ts.JsxEmit.Preserve,
  types: [],
  strict: true,
  noEmit: true,
  skipLibCheck: true,
};

export type Compiled = {
  files: readonly ts.SourceFile[];
  source: (path: string) => ts.SourceFile | undefined;
  checker: ts.TypeChecker;
};

export type CompileOptions = { packages: boolean };

export function compile(
  paths: readonly string[],
  options: CompileOptions = { packages: true },
): Compiled {
  const host = ts.createCompilerHost(compilerOptions, true);
  if (!options.packages) {
    const exists = host.fileExists.bind(host);
    host.fileExists = (file) => !packageFile.test(file) && exists(file);
  }
  const program = ts.createProgram(paths, compilerOptions, host);
  for (const path of paths) {
    const source = program.getSourceFile(path);
    if (source) program.getSemanticDiagnostics(source);
  }
  return {
    files: program.getSourceFiles().filter((file) => !packageFile.test(file.fileName)),
    source: (path) => program.getSourceFile(path),
    checker: program.getTypeChecker(),
  };
}

export type Alias = { name: string; file: string };

export function fileOf(node: ts.Node): string {
  return node.getSourceFile().fileName;
}

export function isPackageFile(file: string): boolean {
  return packageFile.test(file);
}

export function isDefaultLibraryFile(file: string): boolean {
  return defaultLibraryFile.test(file);
}

export function isDomLibraryFile(file: string): boolean {
  return domLibraryFile.test(file);
}

function symbolAt(compiled: Compiled, node: ts.Node): ts.Symbol | undefined {
  const symbol =
    ts.isShorthandPropertyAssignment(node.parent) && node.parent.name === node
      ? compiled.checker.getShorthandAssignmentValueSymbol(node.parent)
      : compiled.checker.getSymbolAtLocation(node);
  return symbol && symbol.flags & ts.SymbolFlags.Alias
    ? compiled.checker.getAliasedSymbol(symbol)
    : symbol;
}

export function symbolOf(compiled: Compiled, node: ts.Node): ts.Symbol | undefined {
  return symbolAt(compiled, node);
}

function contextualMember(compiled: Compiled, node: ts.Node): ts.Symbol | undefined {
  const property = node.parent;
  if (
    !(ts.isPropertyAssignment(property) || ts.isShorthandPropertyAssignment(property)) ||
    property.name !== node ||
    !ts.isObjectLiteralExpression(property.parent)
  ) {
    return undefined;
  }
  const name = ts.isComputedPropertyName(node)
    ? stringsIn(compiled, node.expression)[0]
    : ts.isIdentifier(node) || ts.isStringLiteral(node)
      ? node.text
      : undefined;
  const expected = compiled.checker.getContextualType(property.parent);
  return name === undefined || !expected
    ? undefined
    : compiled.checker.getPropertyOfType(compiled.checker.getNonNullableType(expected), name);
}

export function declarationsOf(compiled: Compiled, node: ts.Node): ts.Declaration[] {
  return [
    ...(symbolAt(compiled, node)?.getDeclarations() ?? []),
    ...(contextualMember(compiled, node)?.getDeclarations() ?? []),
  ];
}

export function nameOf(declaration: ts.Node): string {
  const name = ts.getNameOfDeclaration(declaration as ts.Declaration);
  return name && (ts.isIdentifier(name) || ts.isStringLiteral(name)) ? name.text : "";
}

export function resolvesTo(
  compiled: Compiled,
  node: ts.Node,
  matches: (declaration: ts.Declaration) => boolean,
): boolean {
  return declarationsOf(compiled, node).some(matches);
}

function isPropertyName(node: ts.Node): boolean {
  const parent = node.parent;
  return (
    (ts.isPropertyAccessExpression(parent) && parent.name === node) ||
    (ts.isQualifiedName(parent) && parent.right === node) ||
    ((ts.isPropertyAssignment(parent) ||
      ts.isPropertyDeclaration(parent) ||
      ts.isPropertySignature(parent) ||
      ts.isMethodDeclaration(parent)) &&
      parent.name === node)
  );
}

export function isValueReference(node: ts.Node): node is ts.Identifier {
  return (
    ts.isIdentifier(node) &&
    !isInTypePosition(node) &&
    !isPropertyName(node) &&
    !ts.isImportSpecifier(node.parent) &&
    !ts.isImportClause(node.parent) &&
    ts.getNameOfDeclaration(node.parent as ts.Declaration) !== node
  );
}

export function isBrowserOnlyGlobal(compiled: Compiled, node: ts.Node): node is ts.Identifier {
  if (!isValueReference(node)) return false;
  const declarations = declarationsOf(compiled, node);
  return (
    declarations.length > 0 &&
    declarations.every((declaration) => isDomLibraryFile(fileOf(declaration)))
  );
}

export function isGlobalObject(compiled: Compiled, node: ts.Node): node is ts.Identifier {
  return (
    isValueReference(node) &&
    node.text === globalObject &&
    declarationsOf(compiled, node).length === 0 &&
    symbolAt(compiled, node) !== undefined
  );
}

function aliasesOf(type: ts.Type | undefined): Alias[] {
  if (!type) return [];
  return (type.isUnion() ? type.types : [type]).flatMap((part) => {
    const declaration = part.aliasSymbol?.getDeclarations()?.[0];
    return part.aliasSymbol && declaration
      ? [{ name: part.aliasSymbol.getName(), file: fileOf(declaration) }]
      : [];
  });
}

export function contextualAliases(compiled: Compiled, node: ts.Node): Alias[] {
  return ts.isExpression(node) ? aliasesOf(compiled.checker.getContextualType(node)) : [];
}

export function parameterAliases(compiled: Compiled, call: ts.CallLikeExpression): Alias[] {
  const signature = compiled.checker.getResolvedSignature(call);
  return (signature?.getParameters() ?? []).flatMap((parameter) => {
    const type = compiled.checker.getTypeOfSymbol(parameter);
    const members = (type.isUnion() ? type.types : [type]).flatMap((part) =>
      part.flags & ts.TypeFlags.Object && part.getCallSignatures().length === 0
        ? compiled.checker
            .getPropertiesOfType(part)
            .map((member) => compiled.checker.getTypeOfSymbol(member))
        : [],
    );
    return [type, ...members].flatMap(aliasesOf);
  });
}

export function returnsAlias(compiled: Compiled, fn: ts.Node, alias: string): boolean {
  if (!ts.isFunctionLike(fn)) return false;
  const signature = compiled.checker.getSignatureFromDeclaration(fn);
  if (!signature) return false;
  const returned = compiled.checker.getReturnTypeOfSignature(signature);
  const named = (type: ts.Type) => aliasesOf(type).some(({ name }) => name === alias);
  return (
    named(returned) ||
    compiled.checker
      .getPropertiesOfType(returned)
      .some((member) => named(compiled.checker.getTypeOfSymbol(member)))
  );
}

export function stringsIn(compiled: Compiled, expression: ts.Expression | undefined): string[] {
  if (!expression) return [];
  const type = compiled.checker.getTypeAtLocation(expression);
  return (type.isUnion() ? type.types : [type]).flatMap((part) =>
    part.isStringLiteral() ? [part.value] : [],
  );
}

export type AssertedType = { never: boolean; any: boolean; aliases: string[]; brands: string[] };

export function assertedType(compiled: Compiled, node: ts.Node): AssertedType | undefined {
  if (!ts.isAsExpression(node) && !ts.isTypeAssertionExpression(node)) return undefined;
  if (ts.isConstTypeReference(node.type)) return undefined;
  const type = compiled.checker.getTypeFromTypeNode(node.type);
  const parts = type.isUnionOrIntersection() ? [type, ...type.types] : [type];
  return {
    never: (type.flags & ts.TypeFlags.Never) !== 0,
    any: (type.flags & ts.TypeFlags.Any) !== 0,
    aliases: parts.flatMap(aliasesOf).map(({ name }) => name),
    brands: compiled.checker.getPropertiesOfType(type).flatMap((member) => {
      const owner = ts.findAncestor(member.valueDeclaration, ts.isTypeAliasDeclaration);
      return owner ? [owner.name.text] : [];
    }),
  };
}

export type ClassRef = { name: string; file: string };

function classOf(type: ts.Type): ClassRef[] {
  const declaration = type.getSymbol()?.getDeclarations()?.[0];
  return declaration
    ? [{ name: type.getSymbol()?.getName() ?? "", file: fileOf(declaration) }]
    : [];
}

export function constructedClass(compiled: Compiled, node: ts.Node): ClassRef[] {
  return ts.isNewExpression(node) ? classOf(compiled.checker.getTypeAtLocation(node)) : [];
}

export function constructorClasses(compiled: Compiled, node: ts.Node): ClassRef[] {
  if (!ts.isExpression(node)) return [];
  return compiled.checker
    .getTypeAtLocation(node)
    .getConstructSignatures()
    .flatMap((signature) => classOf(compiled.checker.getReturnTypeOfSignature(signature)));
}

export function enclosingFunctionName(node: ts.Node): string | undefined {
  const owner = ts.findAncestor(
    node.parent,
    (ancestor) =>
      ts.isFunctionDeclaration(ancestor) ||
      (ts.isVariableDeclaration(ancestor) && ts.isSourceFile(ancestor.parent.parent.parent)),
  );
  return owner ? nameOf(owner) : undefined;
}

export function firstLine(node: ts.Node): string {
  return node.getText().split("\n")[0];
}

export type Reach = { nodes: ts.Node[]; functions: Set<ts.Node> };

function followed(declaration: ts.Declaration): ts.Node | undefined {
  if (isPackageFile(fileOf(declaration))) return undefined;
  if (ts.isFunctionDeclaration(declaration)) return declaration.body ? declaration : undefined;
  if (ts.isVariableDeclaration(declaration)) return declaration.initializer;
  return undefined;
}

export function reachedFrom(
  compiled: Compiled,
  roots: readonly ts.Node[],
  prune: (node: ts.Node) => boolean = () => false,
): Reach {
  const nodes = new Set<ts.Node>();
  const functions = new Set<ts.Node>();
  const queue = [...roots];
  const visit = (node: ts.Node): void => {
    if (nodes.has(node) || prune(node)) return;
    nodes.add(node);
    if (isValueReference(node)) {
      for (const declaration of declarationsOf(compiled, node)) {
        const body = followed(declaration);
        if (body && !functions.has(declaration)) {
          functions.add(declaration);
          queue.push(body);
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  while (queue.length > 0) {
    const next = queue.pop();
    if (next) visit(next);
  }
  return { nodes: [...nodes], functions };
}
