import { join } from "node:path";
import { repositoryRoot } from "#/scripts/repository.ts";
import { parse, ts } from "#/scripts/syntax.ts";

export const tokensFile = "packages/core/src/tokens.stylex.ts";

const kindByPrefix = [
  ["--solix-color-", "colour"],
  ["--solix-radius-", "radius"],
  ["--solix-spacing-", "spacing"],
] as const;
const kindOfAnyOtherToken = "length";

export type TokenKind = (typeof kindByPrefix)[number][1] | typeof kindOfAnyOtherToken;

function lineOf(source: ts.SourceFile, node: ts.Node): number {
  return source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
}

export function tokenValues(file: string = tokensFile): Record<string, string> {
  const source = parse(join(repositoryRoot, file));
  const definitions: ts.ObjectLiteralElementLike[] = [];
  const visit = (node: ts.Node): void => {
    if (
      ts.isCallExpression(node) &&
      node.expression.getText(source) === "stylex.defineVars" &&
      node.arguments[0] &&
      ts.isObjectLiteralExpression(node.arguments[0])
    ) {
      definitions.push(...node.arguments[0].properties);
    }
    node.forEachChild(visit);
  };
  visit(source);

  const values: Record<string, string> = {};
  for (const property of definitions) {
    const where = `${file}:${lineOf(source, property)}`;
    if (
      !ts.isPropertyAssignment(property) ||
      !ts.isStringLiteral(property.name) ||
      !ts.isStringLiteral(property.initializer)
    ) {
      throw new Error(`${where}: write each token as "--solix-name": "value".`);
    }
    if (property.name.text in values) {
      throw new Error(`${where}: ${property.name.text} is defined twice.`);
    }
    values[property.name.text] = property.initializer.text;
  }
  if (Object.keys(values).length === 0) {
    throw new Error(`${file}: no tokens were found in a stylex.defineVars({ ... }) call.`);
  }
  return values;
}

export function tokenKind(name: string): TokenKind {
  return kindByPrefix.find(([prefix]) => name.startsWith(prefix))?.[1] ?? kindOfAnyOtherToken;
}
