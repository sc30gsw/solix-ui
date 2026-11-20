import { join } from "node:path";
import valueParser from "postcss-value-parser";
import { repositoryRoot } from "#/scripts/repository.ts";
import { parse, ts } from "#/scripts/syntax.ts";

export const tokensFile = "packages/core/src/tokens.stylex.ts";

const kindByPrefix = [
  ["--solix-color-", "colour"],
  ["--solix-radius-", "radius"],
  ["--solix-spacing-", "spacing"],
  ["--solix-shadow-", "shadow"],
] as const;
const kindOfAnyOtherToken = "length";

export type TokenKind = (typeof kindByPrefix)[number][1] | typeof kindOfAnyOtherToken;

function lineOf(source: ts.SourceFile, node: ts.Node): number {
  return source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
}

const variablesDefiner = "stylex.defineVars";
const constantsDefiner = "stylex.defineConsts";

function nameOf(property: ts.ObjectLiteralElementLike, definer: string): string | undefined {
  if (!ts.isPropertyAssignment(property)) return undefined;
  if (ts.isStringLiteral(property.name)) return property.name.text;
  return definer === constantsDefiner && ts.isIdentifier(property.name)
    ? property.name.text
    : undefined;
}

export function tokenValues(file: string = tokensFile): Record<string, string> {
  const source = parse(join(repositoryRoot, file));
  const definitions: (readonly [definer: string, property: ts.ObjectLiteralElementLike])[] = [];
  const visit = (node: ts.Node): void => {
    const definer = ts.isCallExpression(node) ? node.expression.getText(source) : undefined;
    if (
      ts.isCallExpression(node) &&
      (definer === variablesDefiner || definer === constantsDefiner) &&
      node.arguments[0] &&
      ts.isObjectLiteralExpression(node.arguments[0])
    ) {
      definitions.push(
        ...node.arguments[0].properties.map((property) => [definer, property] as const),
      );
    }
    node.forEachChild(visit);
  };
  visit(source);

  const values: Record<string, string> = {};
  for (const [definer, property] of definitions) {
    const where = `${file}:${lineOf(source, property)}`;
    const name = nameOf(property, definer);
    if (
      name === undefined ||
      !ts.isPropertyAssignment(property) ||
      !ts.isStringLiteral(property.initializer)
    ) {
      throw new Error(
        `${where}: write each token as "--solix-name": "value", and each constant as name: "value".`,
      );
    }
    if (name in values) {
      throw new Error(`${where}: ${name} is defined twice.`);
    }
    values[name] = property.initializer.text;
  }
  if (Object.keys(values).length === 0) {
    throw new Error(
      `${file}: no tokens were found in a ${variablesDefiner}({ ... }) or ${constantsDefiner}({ ... }) call.`,
    );
  }
  return values;
}

const perSchemeFunction = "light-dark";

export type SchemeValues = { light: string; dark: string };

function isPerSchemeFunction(node: valueParser.Node): node is valueParser.FunctionNode {
  return node.type === "function" && node.value.toLowerCase() === perSchemeFunction;
}

export function holdsSchemeValues(value: string): boolean {
  let found = false;
  valueParser(value).walk((node) => {
    found ||= isPerSchemeFunction(node);
  });
  return found;
}

export function schemeValues(value: string): SchemeValues | undefined {
  const [whole, ...others] = valueParser(value.trim()).nodes;
  if (whole === undefined || others.length > 0 || !isPerSchemeFunction(whole)) return undefined;
  const written: valueParser.Node[][] = [[]];
  for (const node of whole.nodes) {
    if (node.type === "div" && node.value === ",") written.push([]);
    else written.at(-1)?.push(node);
  }
  const [light, dark, ...more] = written.map((nodes) => valueParser.stringify(nodes).trim());
  return light && dark && more.length === 0 ? { light, dark } : undefined;
}

export function tokenKind(name: string): TokenKind {
  return kindByPrefix.find(([prefix]) => name.startsWith(prefix))?.[1] ?? kindOfAnyOtherToken;
}
