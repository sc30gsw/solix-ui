import * as ts from "./tree";

export type Exports = { functions: string[]; types: string[]; others: string[] };

export type Comment = { pos: number; end: number; text: string };

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

function isNode(value: unknown): value is ts.Node {
  return typeof value === "object" && value !== null && "kind" in value;
}

export function nameOf(node: ts.Node): ts.Node | undefined {
  if (!("name" in node)) return undefined;
  return isNode(node.name) ? node.name : undefined;
}

export function isTypeOnlyImport(clause: ts.ImportClause | undefined): boolean {
  return clause?.phaseModifier === ts.SyntaxKind.TypeKeyword;
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

export function commentsIn(source: ts.SourceFile): Comment[] {
  const scanner = ts.createScanner(false);
  const found: Comment[] = [];
  const scan = (pos: number, end: number): void => {
    if (end <= pos) return;
    scanner.setText(source.text, pos, end - pos);
    for (let kind = scanner.scan(); kind !== ts.SyntaxKind.EndOfFile; kind = scanner.scan()) {
      if (commentKinds.has(kind)) {
        const start = scanner.getTokenStart();
        found.push({ pos: start, end: scanner.getTokenEnd(), text: scanner.getTokenText() });
      }
    }
  };
  const visit = (node: ts.Node): void => {
    let cursor = node.pos;
    let hasChildren = false;
    ts.forEachChild(node, (child) => {
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
