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

function isNoLength(left: ts.Expression, right: ts.Expression): boolean {
  return (
    ts.isPropertyAccessExpression(left) &&
    left.name.text === "length" &&
    ts.isNumericLiteral(right) &&
    right.text === "0"
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
  if (!ts.isBinaryExpression(node) || !equality.has(node.operatorToken.kind)) return false;
  const { left, right } = node;
  return (
    isEmptyText(left) || isEmptyText(right) || isNoLength(left, right) || isNoLength(right, left)
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
      'const kept = (given: string) => given.length === 1 || given === "a";',
    ].join("\n"),
    ".tsx",
  );

  expect(
    emptyOrBlankTests(pastMistakes, "SimpleGrid.tsx").map((problem) => problem.split(":")[1]),
  ).toEqual(["2", "4", "5", "6", "7"]);
  expect(
    components.flatMap(({ file, source }) => emptyOrBlankTests(source, relativePath(file))),
  ).toEqual([]);
});
