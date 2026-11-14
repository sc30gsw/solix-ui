import { readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";

export const tokensFile = "packages/core/src/tokens.stylex.ts";

const repositoryRoot = join(import.meta.dirname, "..");

const kindByPrefix = [
  ["--solix-color-", "colour"],
  ["--solix-radius-", "radius"],
];

function lineOf(source, node) {
  return source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
}

/**
 * @param {string} [file]
 * @returns {Record<string, string>}
 */
export function tokenValues(file = tokensFile) {
  const source = ts.createSourceFile(
    file,
    readFileSync(join(repositoryRoot, file), "utf8"),
    ts.ScriptTarget.Latest,
    true,
  );
  const definitions = [];
  const visit = (node) => {
    if (
      ts.isCallExpression(node) &&
      node.expression.getText(source) === "stylex.defineVars" &&
      node.arguments[0] &&
      ts.isObjectLiteralExpression(node.arguments[0])
    ) {
      definitions.push(...node.arguments[0].properties);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);

  const values = {};
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

/**
 * @param {string} name
 * @returns {"colour" | "radius" | "length"}
 */
export function tokenKind(name) {
  return kindByPrefix.find(([prefix]) => name.startsWith(prefix))?.[1] ?? "length";
}
