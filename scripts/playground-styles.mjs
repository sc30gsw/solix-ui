import { readFileSync } from "node:fs";
import { join } from "node:path";
import postcss from "postcss";

const playgroundStylesheet = "apps/playground/src/app.css";

const repositoryRoot = join(import.meta.dirname, "..");

/**
 * The value that the playground's own stylesheet declares for `property` in the rule for `selector`.
 * @param {string} selector
 * @param {string} property
 * @returns {string}
 */
export function playgroundValue(selector, property) {
  const values = [];
  postcss
    .parse(readFileSync(join(repositoryRoot, playgroundStylesheet), "utf8"))
    .walkRules((rule) => {
      if (rule.selector === selector) {
        rule.walkDecls(property, (declaration) => {
          values.push(declaration.value);
        });
      }
    });
  if (values.length !== 1) {
    throw new Error(
      `${playgroundStylesheet}: expected one ${property} in the rule for ${selector}, found ${values.length}.`,
    );
  }
  return values[0];
}
