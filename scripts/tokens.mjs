import { readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";

export const tokensFile = "packages/core/src/tokens.stylex.ts";

const repositoryRoot = join(import.meta.dirname, "..");

function lineOf(source, node) {
  return source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
}

/**
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

const colourTokenPrefix = "--solix-color-";

/**
 * @param {string} name
 * @returns {boolean}
 */
export function isColourToken(name) {
  return name.startsWith(colourTokenPrefix);
}

function probed(page, values, property) {
  return page.evaluate(
    ([written, probedProperty]) => {
      const computed = {};
      for (const [name, value] of Object.entries(written)) {
        const probe = document.createElement("div");
        probe.style.setProperty(probedProperty, value);
        if (probe.style.getPropertyValue(probedProperty) === "") {
          throw new Error(`${name}: "${value}" is not a valid ${probedProperty} in this browser.`);
        }
        document.body.append(probe);
        computed[name] = getComputedStyle(probe).getPropertyValue(probedProperty);
        probe.remove();
      }
      return computed;
    },
    [values, property],
  );
}

/**
 * @template {string} Name
 * @param {import("playwright").Page} page
 * @param {Record<Name, string>} values
 * @returns {Promise<Record<Name, string>>}
 */
export function computedColours(page, values) {
  return probed(page, values, "color");
}

/**
 * @param {import("playwright").Page} page
 * @returns {Promise<Record<string, string>>}
 */
export async function computedTokens(page) {
  const entries = Object.entries(tokenValues());
  const colours = Object.fromEntries(entries.filter(([name]) => isColourToken(name)));
  const lengths = Object.fromEntries(entries.filter(([name]) => !isColourToken(name)));
  return {
    ...(await computedColours(page, colours)),
    ...(await probed(page, lengths, "height")),
  };
}
