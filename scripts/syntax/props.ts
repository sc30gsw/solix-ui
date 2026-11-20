import {
  SignatureKind,
  SymbolFlags,
  TypeFlags,
  type Symbol as CheckerSymbol,
  type Type,
} from "typescript/unstable/sync";
import * as ts from "#/scripts/syntax/ast.ts";
import {
  declarationsOfSymbol,
  isDefaultLibraryFile,
  isPackageFile,
  symbolOf,
  unionMembersOf,
} from "#/scripts/syntax/checker.ts";
import type { Program } from "#/scripts/syntax/program.ts";
import {
  descendants,
  enclosingFunctionName,
  fileOf,
  findAncestor,
  staticPropertyName,
} from "#/scripts/syntax/walk.ts";

export type Option = string | number | boolean;

export type Control =
  | { readonly type: "boolean" | "text" | "number" | "object" }
  | { readonly type: "select"; readonly options: readonly Option[] }
  | { readonly type: false };

export type MemberKind =
  | "literal"
  | "suggested"
  | "text"
  | "number"
  | "object"
  | "function"
  | "absent";

export type ComponentProp = {
  readonly name: string;
  readonly control: Control;
  readonly type: string;
  readonly required: boolean;
  readonly declaredBy: string;
  readonly declarations: readonly ts.Node[];
  readonly kinds: ReadonlySet<MemberKind>;
  readonly description: string;
  readonly values?: readonly Option[];
  readonly defaultValue?: string;
};

export type Fallback = { readonly owner: string | undefined; readonly value: string };

export type Fallbacks = ReadonlyMap<ts.Node, readonly Fallback[]>;

export type PropsOptions = {
  readonly fallbacks?: Fallbacks;
  readonly describe?: (declarations: readonly ts.Node[]) => string;
  readonly defaults?: ReadonlyMap<ts.Node, string>;
};

type Member = { kind: "literal"; value: Option } | { kind: Exclude<MemberKind, "literal"> };

type Chosen = { readonly control: Control; readonly values?: readonly Option[] };

const whitespace = /\s+/;
const literalTypes = TypeFlags.StringLiteral | TypeFlags.NumberLiteral | TypeFlags.BooleanLiteral;
const absent = TypeFlags.Undefined | TypeFlags.Null | TypeFlags.Void;
const stringLike = TypeFlags.String | TypeFlags.TemplateLiteral | TypeFlags.StringMapping;

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
  if (part !== type) return unionMembersOf(part).flatMap((member) => memberOf(program, member));
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

function oneLine(text: string): string {
  return text.split(whitespace).filter(Boolean).join(" ");
}

function chosenFor(members: readonly Member[]): Chosen {
  const options = members.flatMap((member) => (member.kind === "literal" ? [member.value] : []));
  const has = (...kinds: Member["kind"][]) => members.some(({ kind }) => kinds.includes(kind));
  const closed = options.length > 0 && !has("text", "number");
  const onlyBooleans = options.every((option) => typeof option === "boolean");
  const bothBooleans = options.length === 2 && onlyBooleans;
  if (closed && bothBooleans && !has("suggested")) {
    return { control: { type: "boolean" }, values: options };
  }
  if (closed) {
    const whole = !has("suggested") && options.length > 1;
    return { control: { type: "select", options }, ...(whole ? { values: options } : {}) };
  }
  if (has("suggested", "text")) return { control: { type: "text" } };
  if (has("number")) return { control: { type: "number" } };
  if (has("object")) return { control: { type: "object" } };
  return { control: { type: false } };
}

export function fallbacksIn(program: Program, sources: readonly ts.SourceFile[]): Fallbacks {
  const found = new Map<ts.Node, Fallback[]>();
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
    const given = {
      owner: enclosingFunctionName(node),
      value: program.checker.typeToString(fallback),
    };
    for (const declaration of declarationsOfSymbol(symbolOf(program, node.left.name))) {
      found.set(declaration, [...(found.get(declaration) ?? []), given]);
    }
  }
  return found;
}

const partialType = "Partial";

function isPartialOfTheLibrary(program: Program, type: ts.TypeNode): boolean {
  if (!ts.isTypeReferenceNode(type) || type.typeArguments?.length !== 1) return false;
  const declaration = symbolOf(program, type.typeName)?.declarations?.[0]?.resolve();
  return (
    declaration !== undefined &&
    ts.isTypeAliasDeclaration(declaration) &&
    declaration.name.text === partialType &&
    isDefaultLibraryFile(fileOf(declaration))
  );
}

export function declaredDefaultsIn(
  program: Program,
  sources: readonly ts.SourceFile[],
): Map<ts.Node, string> {
  const found = new Map<ts.Node, string>();
  for (const node of sources.flatMap((source) => descendants(source))) {
    if (
      !ts.isSatisfiesExpression(node) ||
      !ts.isObjectLiteralExpression(node.expression) ||
      !isPartialOfTheLibrary(program, node.type)
    ) {
      continue;
    }
    const satisfied = program.checker.getTypeAtLocation(node.type);
    for (const property of node.expression.properties) {
      const value = ts.isPropertyAssignment(property)
        ? property.initializer
        : ts.isShorthandPropertyAssignment(property)
          ? property.name
          : undefined;
      const name = staticPropertyName(property);
      const given = value && program.checker.getTypeAtLocation(value);
      const prop = satisfied && name && program.checker.getPropertyOfType(satisfied, name);
      if (!given || !prop || (given.flags & literalTypes) === 0) continue;
      for (const declaration of declarationsOfSymbol(prop)) {
        found.set(declaration, program.checker.typeToString(given));
      }
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
  component: string,
  { fallbacks = new Map(), describe = () => "", defaults = new Map() }: PropsOptions,
): ComponentProp | undefined {
  const declarations = declarationsOfSymbol(symbol).filter(
    (declaration) => !isPackageFile(declaration.getSourceFile().fileName),
  );
  const declared = program.checker.getTypeOfSymbol(symbol);
  if (declarations.length === 0 || !declared) return undefined;
  const members = unionMembersOf(declared).flatMap((member) => memberOf(program, member));
  if (members.every((member) => member.kind === "absent")) return undefined;
  const present = program.checker.getNonNullableType(declared) ?? declared;
  const { control, values } = chosenFor(members);
  const defaultValue =
    declarations.map((declaration) => defaults.get(declaration)).find(Boolean) ??
    declarations
      .map((declaration) => defaultOf(fallbacks.get(declaration) ?? [], component))
      .find(Boolean);
  return {
    name: symbol.name,
    control,
    type: program.checker.typeToString(constrained(program, present)),
    required: (symbol.flags & SymbolFlags.Optional) === 0,
    declaredBy: ownerName(declarations[0]),
    declarations,
    kinds: new Set(members.map(({ kind }) => kind)),
    description:
      oneLine(program.checker.getDocumentationCommentOfSymbol(symbol)) || describe(declarations),
    ...(values === undefined ? {} : { values }),
    ...(defaultValue === undefined ? {} : { defaultValue }),
  };
}

export function propsOfComponent(
  program: Program,
  name: ts.Identifier,
  options: PropsOptions = {},
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
      const prop = propOf(program, symbol, component.name, options);
      if (prop) found.set(prop.name, prop);
    }
  }
  return [...found.values()];
}
