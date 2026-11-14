import { readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";

export const tokensFile = "packages/core/src/tokens.stylex.ts";

const repositoryRoot = join(import.meta.dirname, "..");

function lineOf(source, node) {
  return source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
}

/**
 * The value of every public token in packages/core/src/tokens.stylex.ts, keyed by its custom property name.
 * @returns {Record<string, string>}
 */
export function tokenValues() {
  const source = ts.createSourceFile(
    tokensFile,
    readFileSync(join(repositoryRoot, tokensFile), "utf8"),
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
    const where = `${tokensFile}:${lineOf(source, property)}`;
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
    throw new Error(`${tokensFile}: no tokens were found in a stylex.defineVars({ ... }) call.`);
  }
  return values;
}

/**
 * Each value as the page's browser computes it on a probe element: as a `color` if it is one, otherwise as a `height`.
 * @template {string} Name
 * @param {import("playwright").Page} page
 * @param {Record<Name, string>} values
 * @returns {Promise<Record<Name, string>>}
 */
export function computedValues(page, values) {
  return page.evaluate((written) => {
    const computed = {};
    for (const [name, value] of Object.entries(written)) {
      const probe = document.createElement("div");
      const property = ["color", "height"].find((candidate) => {
        probe.style.setProperty(candidate, value);
        return probe.style.getPropertyValue(candidate) !== "";
      });
      if (property === undefined) {
        throw new Error(`${name}: "${value}" is neither a colour nor a length in this browser.`);
      }
      document.body.append(probe);
      computed[name] = getComputedStyle(probe).getPropertyValue(property);
      probe.remove();
    }
    return computed;
  }, values);
}
