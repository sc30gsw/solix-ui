import { createScanner, type ModifiersBase } from "typescript/unstable/ast";
import * as ts from "#/scripts/syntax/ast.ts";

export type Exports = { functions: string[]; types: string[]; others: string[] };

export type Comment = { pos: number; end: number; text: string };

export type ImportedName = { imported: string; local: string; node: ts.ImportSpecifier };

export type Import = {
  specifier: string;
  names: ImportedName[];
  typeOnly: boolean;
  node: ts.ImportDeclaration;
};

type MaybeNamed = { readonly name?: ts.Node };

const tokenLeaves: ReadonlySet<ts.SyntaxKind> = new Set([
  ts.SyntaxKind.Identifier,
  ts.SyntaxKind.PrivateIdentifier,
  ts.SyntaxKind.StringLiteral,
  ts.SyntaxKind.NumericLiteral,
  ts.SyntaxKind.BigIntLiteral,
  ts.SyntaxKind.RegularExpressionLiteral,
  ts.SyntaxKind.NoSubstitutionTemplateLiteral,
  ts.SyntaxKind.TemplateHead,
  ts.SyntaxKind.TemplateMiddle,
  ts.SyntaxKind.TemplateTail,
  ts.SyntaxKind.JsxText,
  ts.SyntaxKind.JsxTextAllWhiteSpaces,
]);
const commentKinds: ReadonlySet<ts.SyntaxKind> = new Set([
  ts.SyntaxKind.SingleLineCommentTrivia,
  ts.SyntaxKind.MultiLineCommentTrivia,
]);
const flowsThrough: ReadonlySet<ts.SyntaxKind> = new Set([
  ts.SyntaxKind.QuestionQuestionToken,
  ts.SyntaxKind.BarBarToken,
  ts.SyntaxKind.AmpersandAmpersandToken,
  ts.SyntaxKind.CommaToken,
]);
const constAssertion = "const";

export function descendants(node: ts.Node): ts.Node[] {
  const found: ts.Node[] = [];
  const visit = (child: ts.Node): void => {
    found.push(child);
    child.forEachChild(visit);
  };
  node.forEachChild(visit);
  return found;
}

export function findAncestor<T extends ts.Node>(
  node: ts.Node | undefined,
  test: (candidate: ts.Node) => candidate is T,
): T | undefined;
export function findAncestor(
  node: ts.Node | undefined,
  test: (candidate: ts.Node) => boolean,
): ts.Node | undefined;
export function findAncestor(
  node: ts.Node | undefined,
  test: (candidate: ts.Node) => boolean,
): ts.Node | undefined {
  for (let current = node; current; current = current.parent) {
    if (test(current)) return current;
  }
  return undefined;
}

export function modifierFlags(node: ts.Node): ts.ModifierFlags {
  return (node as Partial<ModifiersBase>).modifierFlags ?? ts.ModifierFlags.None;
}

export function isExported(statement: ts.Statement): boolean {
  return (modifierFlags(statement) & ts.ModifierFlags.Export) !== 0;
}

export function staticPropertyName(node: ts.Node): string | undefined {
  const { name } = node as MaybeNamed;
  return name && (ts.isIdentifier(name) || ts.isStringLiteral(name)) ? name.text : undefined;
}

export function nameOf(declaration: ts.Node): string {
  return staticPropertyName(declaration) ?? "";
}

export function isTypeOnlyImport(clause: ts.ImportClause | undefined): boolean {
  return clause?.phaseModifier === ts.SyntaxKind.TypeKeyword;
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
    return [
      {
        specifier: statement.moduleSpecifier.text,
        names,
        typeOnly: isTypeOnlyImport(statement.importClause),
        node: statement,
      },
    ];
  });
}

export function moduleSpecifierOf(node: ts.Node): ts.Node | undefined {
  if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) return node.moduleSpecifier;
  if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument))
    return node.argument.literal;
  const loadsAModule =
    ts.isCallExpression(node) &&
    (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
      node.expression.getText() === "require");
  return loadsAModule ? node.arguments[0] : undefined;
}

export function unwrapped(expression: ts.Expression): ts.Expression {
  return ts.isParenthesizedExpression(expression) ||
    ts.isSatisfiesExpression(expression) ||
    ts.isNonNullExpression(expression) ||
    ts.isTypeAssertion(expression) ||
    ts.isAsExpression(expression)
    ? unwrapped(expression.expression)
    : expression;
}

export function isConstTypeReference(node: ts.Node): boolean {
  return (
    ts.isTypeReferenceNode(node) &&
    ts.isIdentifier(node.typeName) &&
    node.typeName.text === constAssertion &&
    node.typeArguments === undefined
  );
}

export function isAsConst(expression: ts.Expression): boolean {
  if (ts.isParenthesizedExpression(expression) || ts.isSatisfiesExpression(expression)) {
    return isAsConst(expression.expression);
  }
  return ts.isAsExpression(expression) && expression.type.getText() === constAssertion;
}

export function sourcesOf(expression: ts.Expression): ts.Identifier[] {
  const value = unwrapped(expression);
  if (ts.isIdentifier(value)) return [value];
  if (ts.isPropertyAccessExpression(value) || ts.isElementAccessExpression(value)) {
    return sourcesOf(value.expression);
  }
  if (ts.isBinaryExpression(value) && flowsThrough.has(value.operatorToken.kind)) {
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
    if (!ts.isSignatureDeclaration(node) && !ts.isClassLikeDeclaration(node)) {
      node.forEachChild(visit);
    }
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
  return findAncestor(node.parent, ts.isTypeNode) !== undefined;
}

function isNameOfItsParent(node: ts.Node): boolean {
  return (node.parent as MaybeNamed).name === node;
}

function isPropertyName(node: ts.Node): boolean {
  const parent = node.parent;
  return (
    (ts.isPropertyAccessExpression(parent) && parent.name === node) ||
    (ts.isQualifiedName(parent) && parent.right === node) ||
    ((ts.isPropertyAssignment(parent) ||
      ts.isPropertyDeclaration(parent) ||
      ts.isPropertySignatureDeclaration(parent) ||
      ts.isMethodDeclaration(parent)) &&
      parent.name === node) ||
    (ts.isBindingElement(parent) && parent.propertyName === node)
  );
}

export function isValueReference(node: ts.Node): node is ts.Identifier {
  return (
    ts.isIdentifier(node) &&
    !isInTypePosition(node) &&
    !isPropertyName(node) &&
    !ts.isImportSpecifier(node.parent) &&
    !ts.isImportClause(node.parent) &&
    !isNameOfItsParent(node)
  );
}

export function fileOf(node: ts.Node): string {
  return node.getSourceFile().fileName;
}

export function enclosingFunctionName(node: ts.Node): string | undefined {
  const owner = findAncestor(
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

export function commentsIn(source: ts.SourceFile): Comment[] {
  const scanner = createScanner(false);
  const found: Comment[] = [];
  const scan = (pos: number, end: number): void => {
    if (end <= pos) return;
    scanner.setText(source.text, pos, end - pos);
    for (let kind = scanner.scan(); kind !== ts.SyntaxKind.EndOfFile; kind = scanner.scan()) {
      if (commentKinds.has(kind)) {
        found.push({
          pos: scanner.getTokenStart(),
          end: scanner.getTokenEnd(),
          text: scanner.getTokenText(),
        });
      }
    }
  };
  const visit = (node: ts.Node): void => {
    let cursor = node.pos;
    let hasChildren = false;
    node.forEachChild((child) => {
      hasChildren = true;
      scan(cursor, child.pos);
      visit(child);
      cursor = child.end;
    });
    if (hasChildren) scan(cursor, node.end);
    else scan(node.pos, tokenLeaves.has(node.kind) ? node.getStart(source) : node.end);
  };
  visit(source);
  return found;
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
