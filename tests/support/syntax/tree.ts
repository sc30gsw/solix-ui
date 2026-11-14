import {
  isNoSubstitutionTemplateLiteral,
  isStringLiteral,
  SyntaxKind,
  type ModifierLike,
  type Node,
  type NoSubstitutionTemplateLiteral,
  type StringLiteral,
} from "typescript/unstable/ast";

export * from "typescript/unstable/ast";
export type { Checker, Type } from "typescript/unstable/sync";

const functionLikeKinds: ReadonlySet<SyntaxKind> = new Set([
  SyntaxKind.FunctionDeclaration,
  SyntaxKind.MethodDeclaration,
  SyntaxKind.Constructor,
  SyntaxKind.GetAccessor,
  SyntaxKind.SetAccessor,
  SyntaxKind.FunctionExpression,
  SyntaxKind.ArrowFunction,
  SyntaxKind.MethodSignature,
  SyntaxKind.CallSignature,
  SyntaxKind.ConstructSignature,
  SyntaxKind.IndexSignature,
  SyntaxKind.FunctionType,
  SyntaxKind.ConstructorType,
]);

export function forEachChild(node: Node, visit: (child: Node) => void): void {
  node.forEachChild(visit);
}

export function canHaveModifiers(
  node: Node,
): node is Node & { modifiers?: readonly ModifierLike[] } {
  return "modifiers" in node;
}

export function getModifiers(node: Node): readonly ModifierLike[] | undefined {
  return canHaveModifiers(node) ? node.modifiers : undefined;
}

export function findAncestor<T extends Node>(
  node: Node | undefined,
  test: (candidate: Node) => candidate is T,
): T | undefined {
  for (let current = node; current; current = current.parent) {
    if (test(current)) return current;
  }
  return undefined;
}

export function isFunctionLike(node: Node | undefined): boolean {
  return node !== undefined && functionLikeKinds.has(node.kind);
}

export function isStringLiteralLike(
  node: Node,
): node is StringLiteral | NoSubstitutionTemplateLiteral {
  return isStringLiteral(node) || isNoSubstitutionTemplateLiteral(node);
}
