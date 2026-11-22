import { expect, test } from "vite-plus/test";
import { descendants, parseText, ts } from "#/scripts/syntax.ts";
import { components, lineOf, relativePath } from "#/tests/support/library-sources.ts";

const trimMethods = new Set(["trim", "trimStart", "trimEnd"]);
const equality = new Set([
  ts.SyntaxKind.EqualsEqualsEqualsToken,
  ts.SyntaxKind.EqualsEqualsToken,
  ts.SyntaxKind.ExclamationEqualsEqualsToken,
  ts.SyntaxKind.ExclamationEqualsToken,
]);
const sharedValueTests =
  "Read a style value with `declarable` and an HTML boolean attribute with `booleanAttribute`, both in `packages/core/src/css-syntax.ts`, and a nonce with `nonceOf` from `packages/core/src/run-time-style.ts`, and fix an empty or blank value there, for every component at once.";

function isEmptyText(node: ts.Expression): boolean {
  return ts.isStringLiteralLikeNode(node) && node.text === "";
}

function isLength(node: ts.Expression): boolean {
  return ts.isPropertyAccessExpression(node) && node.name.text === "length";
}

function isNumber(node: ts.Expression, value: string): boolean {
  return ts.isNumericLiteral(node) && node.text === value;
}

function comparesLengthWithNone({ left, operatorToken, right }: ts.BinaryExpression): boolean {
  const kind = operatorToken.kind;
  if (equality.has(kind)) {
    return (isLength(left) && isNumber(right, "0")) || (isLength(right) && isNumber(left, "0"));
  }
  return (
    (kind === ts.SyntaxKind.LessThanToken && isLength(left) && isNumber(right, "1")) ||
    (kind === ts.SyntaxKind.GreaterThanToken && isNumber(left, "1") && isLength(right)) ||
    (kind === ts.SyntaxKind.LessThanEqualsToken && isLength(left) && isNumber(right, "0")) ||
    (kind === ts.SyntaxKind.GreaterThanEqualsToken && isNumber(left, "0") && isLength(right))
  );
}

function testsForEmpty(node: ts.Node): boolean {
  if (
    ts.isCallExpression(node) &&
    ts.isPropertyAccessExpression(node.expression) &&
    trimMethods.has(node.expression.name.text)
  ) {
    return true;
  }
  if (
    ts.isPrefixUnaryExpression(node) &&
    node.operator === ts.SyntaxKind.ExclamationToken &&
    isLength(node.operand)
  ) {
    return true;
  }
  if (ts.isCaseClause(node)) return isEmptyText(node.expression);
  if (!ts.isBinaryExpression(node)) return false;
  return (
    (equality.has(node.operatorToken.kind) &&
      (isEmptyText(node.left) || isEmptyText(node.right))) ||
    comparesLengthWithNone(node)
  );
}

function emptyOrBlankTests(source: ts.SourceFile, file: string): string[] {
  return descendants(source)
    .filter(testsForEmpty)
    .map(
      (node) =>
        `${file}:${lineOf(node)}: \`${node.getText(source)}\` tests a value for being empty or blank in a component. ${sharedValueTests}`,
    );
}

test("no component tests a value for being empty or blank itself, so a fix for an empty value lands in the shared layer, for every component", () => {
  const pastMistakes = parseText(
    [
      "function hasMinColWidth(props: { minColWidth?: string | null }): boolean {",
      '  return props.minColWidth !== undefined && props.minColWidth !== null && props.minColWidth !== "";',
      "}",
      "const nonce = (given: string) => given.trim();",
      'const on = (props: { disabled?: boolean | "" }) => props.disabled === "";',
      "const none = (given: string) => given === ``;",
      "const unset = (given: string) => 0 == given.length;",
      'const kept = (given: string) => given.length === 1 || given === "a" || given.length > 1;',
      "const falsy = (given: string) => !given.length;",
      "const short = (given: string) => given.length < 1 || 1 > given.length;",
      'const which = (given: string) => { switch (given) { case "": return 0; default: return 1; } };',
    ].join("\n"),
    ".tsx",
  );

  expect(
    emptyOrBlankTests(pastMistakes, "SimpleGrid.tsx").map((problem) => problem.split(":")[1]),
  ).toEqual(["2", "4", "5", "6", "7", "9", "10", "10", "11"]);
  expect(
    components.flatMap(({ file, source }) => emptyOrBlankTests(source, relativePath(file))),
  ).toEqual([]);
});
