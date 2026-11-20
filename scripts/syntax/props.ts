import {
  SignatureKind,
  SymbolFlags,
  TypeFlags,
  type Symbol as CheckerSymbol,
  type Type,
} from "typescript/unstable/sync";
import * as ts from "#/scripts/syntax/ast.ts";
import { isPackageFile, symbolOf } from "#/scripts/syntax/checker.ts";
import type { Program } from "#/scripts/syntax/program.ts";
import { descendants, findAncestor, staticPropertyName } from "#/scripts/syntax/walk.ts";

export type Control =
  | { readonly type: "boolean" | "text" | "number" | "object" }
  | { readonly type: "select"; readonly options: readonly Option[] }
  | { readonly type: false };

export type Option = string | number | boolean;

export type ComponentProp = {
  readonly name: string;
  readonly control: Control;
  readonly type: string;
  readonly required: boolean;
  readonly declaredBy: string;
  readonly declarations: readonly string[];
  readonly description: string;
  readonly values?: readonly Option[];
  readonly defaultValue?: string;
};

export type Fallback = { readonly owner: string | undefined; readonly value: string };

export type Fallbacks = ReadonlyMap<string, readonly Fallback[]>;

const docComment = /\/\*\*([\s\S]*?)\*\/\s*$/;
const docCommentLineStart = /^\s*\*? ?/;
const docTag = /^@/;
const literalTypes = TypeFlags.StringLiteral | TypeFlags.NumberLiteral | TypeFlags.BooleanLiteral;
const propertyRow = { property: "property", scale: "scale", aliasOf: "aliasOf" } as const;
const absent = TypeFlags.Undefined | TypeFlags.Null | TypeFlags.Void;
const stringLike = TypeFlags.String | TypeFlags.TemplateLiteral | TypeFlags.StringMapping;

type Member =
  | { kind: "literal"; value: Option }
  | { kind: "suggested" | "text" | "number" | "object" | "function" | "absent" };

function declarationsOfSymbol(symbol: CheckerSymbol): ts.Node[] {
  return (symbol.declarations ?? []).flatMap((handle) => {
    const declaration = handle.resolve();
    return declaration ? [declaration] : [];
  });
}

function unionMembers(type: Type): readonly Type[] {
  return (type.isUnionType() ? type.getTypes() : undefined) ?? [type];
}

function constrained(program: Program, type: Type): Type {
  if ((type.flags & TypeFlags.TypeParameter) === 0) return type;
  return program.checker.getBaseConstraintOfType(type) ?? type;
}

function isSuggestion(program: Program, type: Type): boolean {
  const parts = (type.isIntersectionType() ? type.getTypes() : undefined) ?? [];
  return (
    parts.length === 2 &&
    parts.some((part) => (part.flags & TypeFlags.String) !== 0) &&
    parts.some(
      (part) =>
        (part.flags & TypeFlags.Object) !== 0 &&
        program.checker.getPropertiesOfType(part).length === 0 &&
        program.checker.getSignaturesOfType(part, SignatureKind.Call).length === 0,
    )
  );
}

function isStringLike(type: Type): boolean {
  if ((type.flags & stringLike) !== 0) return true;
  return type.isIntersectionType() && (type.getTypes() ?? []).some(isStringLike);
}

function memberOf(program: Program, type: Type): Member[] {
  const part = constrained(program, type);
  if (part !== type) return unionMembers(part).flatMap((member) => memberOf(program, member));
  if ((part.flags & absent) !== 0 || (part.flags & TypeFlags.Never) !== 0) {
    return [{ kind: "absent" }];
  }
  if (part.isStringLiteralType() || part.isNumberLiteralType() || part.isBooleanLiteralType()) {
    return [{ kind: "literal", value: part.value as Option }];
  }
  if (isSuggestion(program, part)) return [{ kind: "suggested" }];
  if (isStringLike(part)) return [{ kind: "text" }];
  if ((part.flags & TypeFlags.Number) !== 0) return [{ kind: "number" }];
  return isCallable(program, part) ||
    program.checker.getPropertiesOfType(part).some((property) => {
      const type = program.checker.getTypeOfSymbol(property);
      return (
        type !== undefined && isCallable(program, program.checker.getNonNullableType(type) ?? type)
      );
    })
    ? [{ kind: "function" }]
    : [{ kind: "object" }];
}

function isCallable(program: Program, type: Type): boolean {
  return program.checker.getSignaturesOfType(type, SignatureKind.Call).length > 0;
}

function controlOf(members: readonly Member[]): Control {
  const options = members.flatMap((member) => (member.kind === "literal" ? [member.value] : []));
  const has = (...kinds: Member["kind"][]) => members.some(({ kind }) => kinds.includes(kind));
  const closed = options.length > 0 && !has("text", "number");
  const bothBooleans = options.length === 2 && options.includes(true) && options.includes(false);
  if (closed && bothBooleans && !has("suggested")) return { type: "boolean" };
  if (closed) return { type: "select", options };
  if (has("suggested", "text")) return { type: "text" };
  if (has("number")) return { type: "number" };
  if (has("object")) return { type: "object" };
  return { type: false };
}

function valuesOf(members: readonly Member[]): readonly Option[] | undefined {
  const options = members.flatMap((member) => (member.kind === "literal" ? [member.value] : []));
  const open = members.some(({ kind }) => ["suggested", "text", "number"].includes(kind));
  const onlyBooleans = options.every((option) => typeof option === "boolean");
  return options.length > 1 && !open && !onlyBooleans ? options : undefined;
}

export function declarationKey(declaration: ts.Node): string {
  return `${declaration.getSourceFile().fileName}:${declaration.pos}`;
}

function rowField(row: ts.ObjectLiteralExpression, field: string): string | undefined {
  for (const property of row.properties) {
    if (!ts.isPropertyAssignment(property) || staticPropertyName(property) !== field) continue;
    return ts.isStringLiteral(property.initializer) ? property.initializer.text : undefined;
  }
  return undefined;
}

function rowDescriptionOf(declaration: ts.Node): string {
  if (!ts.isPropertyAssignment(declaration)) return "";
  const row = declaration.initializer;
  if (!ts.isObjectLiteralExpression(row)) return "";
  const property = rowField(row, propertyRow.property);
  const scale = rowField(row, propertyRow.scale);
  const aliasOf = rowField(row, propertyRow.aliasOf);
  if (aliasOf !== undefined) return `The same as \`${aliasOf}\`.`;
  if (property === undefined) return "";
  return scale === undefined
    ? `Sets the CSS \`${property}\`.`
    : `Sets the CSS \`${property}\`, where a key of the \`${scale}\` scale names its token.`;
}

function descriptionOf(declaration: ts.Node): string {
  const source = declaration.getSourceFile();
  const comment = docComment.exec(source.text.slice(declaration.pos, declaration.getStart(source)));
  if (!comment) return rowDescriptionOf(declaration);
  const lines = comment[1].split("\n").map((line) => line.replace(docCommentLineStart, "").trim());
  const tagAt = lines.findIndex((line) => docTag.test(line));
  return (tagAt === -1 ? lines : lines.slice(0, tagAt)).filter(Boolean).join(" ");
}

function topLevelFunctionNameOf(node: ts.Node): string | undefined {
  const owner = findAncestor(
    node,
    (ancestor) => ts.isFunctionDeclaration(ancestor) && ts.isSourceFile(ancestor.parent),
  );
  return owner && ts.isFunctionDeclaration(owner) ? owner.name?.text : undefined;
}

export function fallbacksIn(program: Program, sources: readonly ts.SourceFile[]): Fallbacks {
  const found = new Map<string, Fallback[]>();
  for (const node of sources.flatMap((source) => descendants(source))) {
    if (
      !ts.isBinaryExpression(node) ||
      node.operatorToken.kind !== ts.SyntaxKind.QuestionQuestionToken ||
      !ts.isPropertyAccessExpression(node.left)
    ) {
      continue;
    }
    const fallback = program.checker.getTypeAtLocation(node.right);
    if (!fallback || (fallback.flags & literalTypes) === 0) continue;
    const owner = topLevelFunctionNameOf(node);
    const prop = symbolOf(program, node.left.name);
    for (const declaration of prop ? declarationsOfSymbol(prop) : []) {
      const key = declarationKey(declaration);
      found.set(key, [
        ...(found.get(key) ?? []),
        { owner, value: program.checker.typeToString(fallback) },
      ]);
    }
  }
  return found;
}

function defaultOf(
  fallbacks: readonly Fallback[],
  component: string | undefined,
): string | undefined {
  const own = fallbacks.filter(({ owner }) => owner === component);
  const values = new Set((own.length > 0 ? own : fallbacks).map(({ value }) => value));
  return values.size === 1 ? [...values][0] : undefined;
}

function ownerName(declaration: ts.Node): string {
  const owner = findAncestor(
    declaration,
    (node) =>
      ts.isTypeAliasDeclaration(node) ||
      ts.isInterfaceDeclaration(node) ||
      ts.isVariableDeclaration(node),
  );
  const name = owner && "name" in owner ? owner.name : undefined;
  return name && ts.isIdentifier(name) ? name.text : "";
}

function propOf(
  program: Program,
  symbol: CheckerSymbol,
  fallbacks: Fallbacks,
  component: string | undefined,
): ComponentProp | undefined {
  const ownDeclarations = declarationsOfSymbol(symbol).filter(
    (declaration) => !isPackageFile(declaration.getSourceFile().fileName),
  );
  const declared = program.checker.getTypeOfSymbol(symbol);
  if (ownDeclarations.length === 0 || !declared) return undefined;
  const members = unionMembers(declared).flatMap((member) => memberOf(program, member));
  if (members.every((member) => member.kind === "absent")) return undefined;
  const present = program.checker.getNonNullableType(declared) ?? declared;
  const declarations = ownDeclarations.map(declarationKey);
  const values = valuesOf(members);
  const defaultValue = declarations
    .map((key) => defaultOf(fallbacks.get(key) ?? [], component))
    .find(Boolean);
  return {
    name: symbol.name,
    control: controlOf(members),
    type: program.checker.typeToString(constrained(program, present)),
    required: (symbol.flags & SymbolFlags.Optional) === 0,
    declaredBy: ownerName(ownDeclarations[0]),
    declarations,
    description: ownDeclarations.map(descriptionOf).find(Boolean) ?? "",
    ...(values === undefined ? {} : { values }),
    ...(defaultValue === undefined ? {} : { defaultValue }),
  };
}

export function propsOfComponent(
  program: Program,
  name: ts.Identifier,
  fallbacks: Fallbacks = new Map(),
): ComponentProp[] {
  const component = symbolOf(program, name);
  const type = component && program.checker.getTypeOfSymbol(component);
  if (!type) throw new Error(`${name.text}: TypeScript gives no type for this export.`);
  const found = new Map<string, ComponentProp>();
  for (const signature of program.checker.getSignaturesOfType(type, SignatureKind.Call)) {
    const [parameter] = signature.getParameters();
    const props = parameter && program.checker.getTypeOfSymbol(parameter);
    if (!props) continue;
    for (const symbol of program.checker.getPropertiesOfType(props)) {
      if (found.has(symbol.name)) continue;
      const prop = propOf(program, symbol, fallbacks, component.name);
      if (prop) found.set(prop.name, prop);
    }
  }
  return [...found.values()];
}
