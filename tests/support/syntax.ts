import { readFileSync } from "node:fs";
import ts from "typescript";

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
