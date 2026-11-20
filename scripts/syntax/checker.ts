import {
  SignatureKind,
  SymbolFlags,
  TypeFlags,
  type Symbol as CheckerSymbol,
  type Type,
} from "typescript/unstable/sync";
import * as ts from "#/scripts/syntax/ast.ts";
import { type Program, stringLiteralTypesOf } from "#/scripts/syntax/program.ts";
import {
  fileOf,
  findAncestor,
  isConstTypeReference,
  isValueReference,
} from "#/scripts/syntax/walk.ts";

export type Alias = { name: string; file: string };

export type AssertedType = { never: boolean; any: boolean; aliases: string[]; brands: string[] };

export type ClassRef = { name: string; file: string };

export type Reach = { nodes: ts.Node[]; functions: Set<ts.Node> };

export type MemberRead = { owner: ts.Node; names: string[] };

const packageFile = /[\\/]node_modules[\\/]/;
const libraryDirectory = String.raw`[\\/]node_modules[\\/]@typescript[\\/]typescript-[^\\/]+[\\/]lib[\\/]`;
const defaultLibraryFile = new RegExp(String.raw`${libraryDirectory}lib\.[^\\/]+\.d\.ts$`);
const domLibraryFile = new RegExp(String.raw`${libraryDirectory}lib\.dom(?:\.[a-z]+)*\.d\.ts$`);
const globalObject = "globalThis";
const reflectiveRead = "get";

export function isPackageFile(file: string): boolean {
  return packageFile.test(file);
}

export function isFileOfPackage(file: string, names: readonly string[]): boolean {
  return isPackageFile(file) && file.split(/[\\/]/).some((part) => names.includes(part));
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

export function propertyDeclarations(
  program: Program,
  owner: ts.Node,
  names: readonly string[],
): ts.Node[] {
  const { checker } = program;
  const type = checker.getTypeAtLocation(owner);
  const present = type && checker.getNonNullableType(type);
  const apparent = present && (checker.getApparentType(present) ?? present);
  if (!apparent) return [];
  return names.flatMap((name) => declarationsOfSymbol(checker.getPropertyOfType(apparent, name)));
}

function boundNames(program: Program, element: ts.Node): string[] {
  if (!ts.isBindingElement(element)) return [];
  const name = element.propertyName ?? element.name;
  if (!name) return [];
  if (ts.isIdentifier(name) || ts.isStringLiteral(name)) return [name.text];
  return ts.isComputedPropertyName(name) ? stringsIn(program, name.expression) : [];
}

function takesAKeyOfAnother(declaration: ts.Node): boolean {
  if (!ts.isSignatureDeclaration(declaration)) return false;
  const named = declaration.parameters[1]?.type;
  if (!named || !ts.isTypeReferenceNode(named) || !ts.isIdentifier(named.typeName)) return false;
  const key = named.typeName.text;
  return (declaration.typeParameters ?? []).some(
    (parameter) =>
      parameter.name.text === key &&
      parameter.constraint !== undefined &&
      ts.isTypeOperatorNode(parameter.constraint) &&
      parameter.constraint.operator === ts.SyntaxKind.KeyOfKeyword,
  );
}

function readsByName(declaration: ts.Node): boolean {
  return (
    ts.isFunctionDeclaration(declaration) &&
    declaration.name?.text === reflectiveRead &&
    isDefaultLibraryFile(fileOf(declaration))
  );
}

export function calledDeclaration(
  program: Program,
  call: ts.CallExpression | ts.NewExpression | ts.TaggedTemplateExpression,
): ts.Node | undefined {
  return program.checker.getResolvedSignature(call)?.declaration?.resolve();
}

function namesAMemberOfItsFirstArgument(program: Program, call: ts.CallExpression): boolean {
  if (call.arguments.length < 2) return false;
  const called = calledDeclaration(program, call);
  return called !== undefined && (takesAKeyOfAnother(called) || readsByName(called));
}

export function memberRead(program: Program, node: ts.Node): MemberRead | undefined {
  if (ts.isPropertyAccessExpression(node)) {
    return { owner: node.expression, names: [node.name.text] };
  }
  if (ts.isElementAccessExpression(node)) {
    return { owner: node.expression, names: stringsIn(program, node.argumentExpression) };
  }
  if (ts.isBindingElement(node) && ts.isObjectBindingPattern(node.parent)) {
    return { owner: node.parent, names: boundNames(program, node) };
  }
  if (ts.isCallExpression(node) && namesAMemberOfItsFirstArgument(program, node)) {
    return { owner: node.arguments[0], names: stringsIn(program, node.arguments[1]) };
  }
  return undefined;
}

export function memberDeclarations(program: Program, node: ts.Node): ts.Node[] {
  if (ts.isPropertyAccessExpression(node)) return declarationsOf(program, node.name);
  const read = memberRead(program, node);
  if (read) return propertyDeclarations(program, read.owner, read.names);
  return isValueReference(node) ? declarationsOf(program, node) : [];
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

function returnTypeOf(program: Program, fn: ts.Node): Type | undefined {
  if (!ts.isSignatureDeclaration(fn)) return undefined;
  const signature = program.checker.getSignatureFromDeclaration(fn);
  return signature && program.checker.getReturnTypeOfSignature(signature);
}

export function returnsAlias(program: Program, fn: ts.Node, alias: string): boolean {
  const returned = returnTypeOf(program, fn);
  if (!returned) return false;
  const named = (type: Type | undefined) => aliasesOf(type).some(({ name }) => name === alias);
  return (
    named(returned) ||
    program.checker
      .getPropertiesOfType(returned)
      .some((member) => named(program.checker.getTypeOfSymbol(member)))
  );
}

export function aliasDeclarationsOfTypeAt(program: Program, node: ts.Node): ts.Node[] {
  return declarationsOfSymbol(program.checker.getTypeAtLocation(node)?.getAliasSymbol());
}

export function aliasDeclarationsReturnedBy(program: Program, node: ts.Node): ts.Node[] {
  const symbol = symbolOf(program, node);
  const type = symbol && program.checker.getTypeOfSymbol(symbol);
  if (!type) return [];
  return program.checker
    .getSignaturesOfType(type, SignatureKind.Call)
    .flatMap((signature) =>
      declarationsOfSymbol(program.checker.getReturnTypeOfSignature(signature)?.getAliasSymbol()),
    );
}

export function stringsIn(program: Program, expression: ts.Expression | undefined): string[] {
  return expression ? stringLiteralTypesOf(program.checker, expression) : [];
}

export function isTypedAny(program: Program, node: ts.Node): boolean {
  const type = program.checker.getTypeAtLocation(node);
  return type !== undefined && (type.flags & TypeFlags.Any) !== 0;
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
  if (!ts.isExpression(node) && !ts.isBindingElement(node)) return [];
  const { checker } = program;
  const type = checker.getTypeAtLocation(node);
  const present = type && checker.getNonNullableType(type);
  if (!present) return [];
  return checker
    .getSignaturesOfType(present, SignatureKind.Construct)
    .flatMap((signature) => classOf(checker.getReturnTypeOfSignature(signature)));
}

function runsWithItsClass(member: ts.Node): boolean {
  return (
    ts.isConstructorDeclaration(member) ||
    ts.isPropertyDeclaration(member) ||
    ts.isClassStaticBlockDeclaration(member)
  );
}

function followed(declaration: ts.Node): ts.Node[] {
  if (isPackageFile(fileOf(declaration))) return [];
  if (
    ts.isFunctionDeclaration(declaration) ||
    ts.isMethodDeclaration(declaration) ||
    ts.isGetAccessorDeclaration(declaration) ||
    ts.isSetAccessorDeclaration(declaration)
  ) {
    return declaration.body ? [declaration] : [];
  }
  if (ts.isVariableDeclaration(declaration) || ts.isPropertyDeclaration(declaration)) {
    return declaration.initializer ? [declaration.initializer] : [];
  }
  return ts.isClassLikeDeclaration(declaration) ? declaration.members.filter(runsWithItsClass) : [];
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
    for (const declaration of memberDeclarations(program, node)) {
      if (functions.has(declaration)) continue;
      const bodies = followed(declaration);
      if (bodies.length === 0) continue;
      functions.add(declaration);
      queue.push(...bodies);
    }
    node.forEachChild(visit);
  };
  while (queue.length > 0) {
    const next = queue.pop();
    if (next) visit(next);
  }
  return { nodes: [...nodes], functions };
}
