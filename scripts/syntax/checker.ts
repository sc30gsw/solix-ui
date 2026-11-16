import {
  SignatureKind,
  SymbolFlags,
  TypeFlags,
  type Symbol as CheckerSymbol,
  type Type,
} from "typescript/unstable/sync";
import * as ts from "./ast.ts";
import { type Program, stringLiteralTypesOf } from "./program.ts";
import { fileOf, findAncestor, isConstTypeReference, isValueReference } from "./walk.ts";

export type Alias = { name: string; file: string };

export type AssertedType = { never: boolean; any: boolean; aliases: string[]; brands: string[] };

export type ClassRef = { name: string; file: string };

export type Reach = { nodes: ts.Node[]; functions: Set<ts.Node> };

const packageFile = /[\\/]node_modules[\\/]/;
const libraryDirectory = String.raw`[\\/]node_modules[\\/]@typescript[\\/]typescript-[^\\/]+[\\/]lib[\\/]`;
const defaultLibraryFile = new RegExp(String.raw`${libraryDirectory}lib\.[^\\/]+\.d\.ts$`);
const domLibraryFile = new RegExp(String.raw`${libraryDirectory}lib\.dom(?:\.[a-z]+)*\.d\.ts$`);
const globalObject = "globalThis";

export function isPackageFile(file: string): boolean {
  return packageFile.test(file);
}

export function isDefaultLibraryFile(file: string): boolean {
  return defaultLibraryFile.test(file);
}

export function isDomLibraryFile(file: string): boolean {
  return domLibraryFile.test(file);
}

function declarationsOfSymbol(symbol: CheckerSymbol | undefined): ts.Node[] {
  return (symbol?.declarations ?? []).flatMap((handle) => {
    const declaration = handle.resolve();
    return declaration ? [declaration] : [];
  });
}

function partsOf(type: Type): readonly Type[] {
  return (type.isUnionType() || type.isIntersectionType() ? type.getTypes() : undefined) ?? [type];
}

function unionMembersOf(type: Type): readonly Type[] {
  return (type.isUnionType() ? type.getTypes() : undefined) ?? [type];
}

export function symbolOf(program: Program, node: ts.Node): CheckerSymbol | undefined {
  const symbol =
    ts.isShorthandPropertyAssignment(node.parent) && node.parent.name === node
      ? program.checker.getShorthandAssignmentValueSymbol(node.parent)
      : program.checker.getSymbolAtLocation(node);
  return symbol && symbol.flags & SymbolFlags.Alias
    ? program.checker.getAliasedSymbol(symbol)
    : symbol;
}

function contextualMember(program: Program, node: ts.Node): CheckerSymbol | undefined {
  const property = node.parent;
  if (
    !(ts.isPropertyAssignment(property) || ts.isShorthandPropertyAssignment(property)) ||
    property.name !== node ||
    !ts.isObjectLiteralExpression(property.parent)
  ) {
    return undefined;
  }
  const name = ts.isComputedPropertyName(node)
    ? stringsIn(program, node.expression)[0]
    : ts.isIdentifier(node) || ts.isStringLiteral(node)
      ? node.text
      : undefined;
  const expected = program.checker.getContextualType(property.parent);
  const present = expected && program.checker.getNonNullableType(expected);
  return name === undefined || !present
    ? undefined
    : program.checker.getPropertyOfType(present, name);
}

export function declarationsOf(program: Program, node: ts.Node): ts.Node[] {
  return [
    ...declarationsOfSymbol(symbolOf(program, node)),
    ...declarationsOfSymbol(contextualMember(program, node)),
  ];
}

export function isBrowserOnlyGlobal(program: Program, node: ts.Node): node is ts.Identifier {
  if (!isValueReference(node)) return false;
  const declarations = declarationsOf(program, node);
  return (
    declarations.length > 0 &&
    declarations.every((declaration) => isDomLibraryFile(fileOf(declaration)))
  );
}

export function isGlobalObject(program: Program, node: ts.Node): node is ts.Identifier {
  return (
    isValueReference(node) &&
    node.text === globalObject &&
    declarationsOf(program, node).length === 0 &&
    symbolOf(program, node) !== undefined
  );
}

function aliasesOf(type: Type | undefined): Alias[] {
  if (!type) return [];
  return unionMembersOf(type).flatMap((part) => {
    const alias = part.getAliasSymbol();
    const [declaration] = declarationsOfSymbol(alias);
    return alias && declaration ? [{ name: alias.name, file: fileOf(declaration) }] : [];
  });
}

export function contextualAliases(program: Program, node: ts.Node): Alias[] {
  return ts.isExpression(node) ? aliasesOf(program.checker.getContextualType(node)) : [];
}

export function parameterAliases(program: Program, call: ts.CallExpression): Alias[] {
  const { checker } = program;
  const callee = checker.getTypeAtLocation(call.expression);
  if (!callee) return [];
  return checker
    .getSignaturesOfType(callee, SignatureKind.Call)
    .flatMap((signature) => signature.getParameters())
    .flatMap((parameter) => {
      const type = checker.getTypeOfSymbol(parameter);
      if (!type) return [];
      const members = partsOf(type).flatMap((part) =>
        part.flags & TypeFlags.Object &&
        checker.getSignaturesOfType(part, SignatureKind.Call).length === 0
          ? checker.getPropertiesOfType(part).flatMap((member) => {
              const memberType = checker.getTypeOfSymbol(member);
              return memberType ? [memberType] : [];
            })
          : [],
      );
      return [type, ...members].flatMap(aliasesOf);
    });
}

export function returnsAlias(program: Program, fn: ts.Node, alias: string): boolean {
  if (!ts.isSignatureDeclaration(fn)) return false;
  const { checker } = program;
  const signature = checker.getSignatureFromDeclaration(fn);
  const returned = signature && checker.getReturnTypeOfSignature(signature);
  if (!returned) return false;
  const named = (type: Type | undefined) => aliasesOf(type).some(({ name }) => name === alias);
  return (
    named(returned) ||
    checker.getPropertiesOfType(returned).some((member) => named(checker.getTypeOfSymbol(member)))
  );
}

export function stringsIn(program: Program, expression: ts.Expression | undefined): string[] {
  return expression ? stringLiteralTypesOf(program.checker, expression) : [];
}

export function assertedType(program: Program, node: ts.Node): AssertedType | undefined {
  if (!ts.isAsExpression(node) && !ts.isTypeAssertion(node)) return undefined;
  if (isConstTypeReference(node.type)) return undefined;
  const type = program.checker.getTypeFromTypeNode(node.type);
  if (!type) return undefined;
  const parts = type.isUnionType() || type.isIntersectionType() ? [type, ...partsOf(type)] : [type];
  return {
    never: (type.flags & TypeFlags.Never) !== 0,
    any: (type.flags & TypeFlags.Any) !== 0,
    aliases: parts.flatMap(aliasesOf).map(({ name }) => name),
    brands: program.checker.getPropertiesOfType(type).flatMap((member) => {
      const owner = findAncestor(member.valueDeclaration?.resolve(), ts.isTypeAliasDeclaration);
      return owner ? [owner.name.text] : [];
    }),
  };
}

function classOf(type: Type | undefined): ClassRef[] {
  const symbol = type?.getSymbol();
  const [declaration] = declarationsOfSymbol(symbol);
  return symbol && declaration ? [{ name: symbol.name, file: fileOf(declaration) }] : [];
}

export function constructedClass(program: Program, node: ts.Node): ClassRef[] {
  return ts.isNewExpression(node) ? classOf(program.checker.getTypeAtLocation(node)) : [];
}

export function constructorClasses(program: Program, node: ts.Node): ClassRef[] {
  if (!ts.isExpression(node)) return [];
  const type = program.checker.getTypeAtLocation(node);
  if (!type) return [];
  return program.checker
    .getSignaturesOfType(type, SignatureKind.Construct)
    .flatMap((signature) => classOf(program.checker.getReturnTypeOfSignature(signature)));
}

function followed(declaration: ts.Node): ts.Node | undefined {
  if (isPackageFile(fileOf(declaration))) return undefined;
  if (ts.isFunctionDeclaration(declaration)) return declaration.body ? declaration : undefined;
  if (ts.isVariableDeclaration(declaration)) return declaration.initializer;
  return undefined;
}

export function reachedFrom(
  program: Program,
  roots: readonly ts.Node[],
  prune: (node: ts.Node) => boolean = () => false,
): Reach {
  const nodes = new Set<ts.Node>();
  const functions = new Set<ts.Node>();
  const queue = [...roots];
  const visit = (node: ts.Node): void => {
    if (nodes.has(node) || prune(node)) return;
    nodes.add(node);
    if (isValueReference(node)) {
      for (const declaration of declarationsOf(program, node)) {
        const body = followed(declaration);
        if (body && !functions.has(declaration)) {
          functions.add(declaration);
          queue.push(body);
        }
      }
    }
    node.forEachChild(visit);
  };
  while (queue.length > 0) {
    const next = queue.pop();
    if (next) visit(next);
  }
  return { nodes: [...nodes], functions };
}
