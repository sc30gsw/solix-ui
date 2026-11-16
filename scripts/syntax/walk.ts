import { createScanner, type ModifiersBase } from "typescript/unstable/ast";
import * as ts from "./ast.ts";

export type Exports = { functions: string[]; types: string[]; others: string[] };

export type Comment = { pos: number; end: number; text: string };

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
): T | undefined {
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

export function isTypeOnlyImport(clause: ts.ImportClause | undefined): boolean {
  return clause?.phaseModifier === ts.SyntaxKind.TypeKeyword;
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
