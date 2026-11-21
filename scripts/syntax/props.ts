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
  isPackageFile,
  symbolOf,
  unionMembersOf,
} from "#/scripts/syntax/checker.ts";
import type { Program } from "#/scripts/syntax/program.ts";
import { findAncestor } from "#/scripts/syntax/walk.ts";

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

export type NoOp =
  | { readonly returns: "nothing" | NoOp }
  | { readonly members: Readonly<Record<string, NoOp>> };

export type Substitute =
  | { readonly kind: "another"; readonly values: readonly Option[] }
  | { readonly kind: "null" }
  | { readonly kind: "no-op"; readonly noOp: NoOp };

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
  readonly substitute?: Substitute;
};

export type PropsOptions = {
  readonly describe?: (declarations: readonly ts.Node[]) => string;
  readonly defaults?: ReadonlyMap<ts.Node, string>;
};

type Member = { kind: "literal"; value: Option } | { kind: Exclude<MemberKind, "literal"> };

type Chosen = { readonly control: Control; readonly values?: readonly Option[] };

const whitespace = /\s+/;
const maxCallbackDepth = 2;
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

function takesNothing(type: Type): boolean {
  return unionMembersOf(type).some(
    (member) => (member.flags & (absent | TypeFlags.Any | TypeFlags.Unknown)) !== 0,
  );
}

function callbackNoOp(program: Program, type: Type, depth: number): NoOp | undefined {
  const present = program.checker.getNonNullableType(type) ?? type;
  const signatures = program.checker.getSignaturesOfType(present, SignatureKind.Call);
  if (signatures.length === 0 || depth > maxCallbackDepth) return undefined;
  const returned = signatures.map((signature) =>
    program.checker.getReturnTypeOfSignature(signature),
  );
  if (returned.every((type) => type !== undefined && takesNothing(type))) {
    return { returns: "nothing" };
  }
  const [only] = returned;
  const inner =
    returned.length === 1 && only !== undefined
      ? callbackNoOp(program, only, depth + 1)
      : undefined;
  return inner === undefined ? undefined : { returns: inner };
}

function noOpOf(program: Program, type: Type): NoOp | undefined {
  const callback = callbackNoOp(program, type, 0);
  if (callback !== undefined) return callback;
  const present = program.checker.getNonNullableType(type) ?? type;
  if (unionMembersOf(present).length !== 1 || (present.flags & TypeFlags.Object) === 0) {
    return undefined;
  }
  const members: Record<string, NoOp> = {};
  for (const property of program.checker.getPropertiesOfType(present)) {
    const member = program.checker.getTypeOfSymbol(property);
    const noOp = member && callbackNoOp(program, member, 0);
    if (noOp === undefined) return undefined;
    members[property.name] = noOp;
  }
  return Object.keys(members).length === 0 ? undefined : { members };
}

function substituteOf(
  program: Program,
  declared: Type,
  members: readonly Member[],
  values: readonly Option[] | undefined,
): Substitute | undefined {
  if (values !== undefined) return { kind: "another", values };
  if (members.some(({ kind }) => kind === "function")) {
    const noOp = noOpOf(program, declared);
    return noOp === undefined ? undefined : { kind: "no-op", noOp };
  }
  return unionMembersOf(declared).some((member) => (member.flags & TypeFlags.Null) !== 0)
    ? { kind: "null" }
    : undefined;
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

export function literalTypeAt(program: Program, node: ts.Node): string | undefined {
  const type = program.checker.getTypeAtLocation(node);
  return type && (type.flags & literalTypes) !== 0 ? program.checker.typeToString(type) : undefined;
}

export type BrandedValue = {
  readonly name: string;
  readonly literal: string | undefined;
  readonly declarations: readonly ts.Node[];
};

export type BrandMembers = { readonly props: string; readonly values: string };

export function brandedValuesAt(
  program: Program,
  node: ts.Node,
  isBrand: (declaration: ts.Node) => boolean,
  members: BrandMembers,
): BrandedValue[] | undefined {
  const { checker } = program;
  const type = checker.getTypeAtLocation(node);
  const brand =
    type &&
    checker.getPropertiesOfType(type).find((member) => declarationsOfSymbol(member).some(isBrand));
  const inner = brand && checker.getTypeOfSymbol(brand);
  const member = (name: string) => {
    const symbol = inner && checker.getPropertyOfType(inner, name);
    return symbol && checker.getTypeOfSymbol(symbol);
  };
  const props = member(members.props);
  const values = member(members.values);
  if (!props || !values) return undefined;
  return checker.getPropertiesOfType(values).map((property) => {
    const value = checker.getTypeOfSymbol(property);
    return {
      name: property.name,
      literal:
        value && (value.flags & literalTypes) !== 0 && "value" in value
          ? JSON.stringify(value.value)
          : undefined,
      declarations: declarationsOfSymbol(checker.getPropertyOfType(props, property.name)),
    };
  });
}

/** The nodes among `nodes` whose type has a property that `isBrand` names by its declaration. */
export function nodesOfBrandedType<N extends ts.Node>(
  program: Program,
  nodes: readonly N[],
  isBrand: (declaration: ts.Node) => boolean,
): N[] {
  const { checker } = program;
  const types = nodes.length === 0 ? [] : checker.getTypeAtLocation(nodes);
  const branded = new Map<unknown, boolean>();
  return nodes.filter((_, at) => {
    const type = types[at];
    if (type === undefined) return false;
    const known = branded.get(type.id);
    if (known !== undefined) return known;
    const has = checker
      .getPropertiesOfType(type)
      .some((member) => declarationsOfSymbol(member).some(isBrand));
    branded.set(type.id, has);
    return has;
  });
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
  { describe = () => "", defaults = new Map() }: PropsOptions,
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
  const defaultValue = declarations.map((declaration) => defaults.get(declaration)).find(Boolean);
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
    ...optional("substitute", substituteOf(program, declared, members, values)),
  };
}

function optional<K extends string, V>(key: K, value: V | undefined): Partial<Record<K, V>> {
  return value === undefined ? {} : ({ [key]: value } as Record<K, V>);
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
      const prop = propOf(program, symbol, options);
      if (prop) found.set(prop.name, prop);
    }
  }
  return [...found.values()];
}
