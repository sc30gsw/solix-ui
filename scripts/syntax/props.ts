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
import { findAncestor } from "#/scripts/syntax/walk.ts";

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
};

const absent = TypeFlags.Undefined | TypeFlags.Null | TypeFlags.Void;
const stringLike = TypeFlags.String | TypeFlags.TemplateLiteral | TypeFlags.StringMapping;

type Member =
  | { kind: "literal"; value: Option }
  | { kind: "text" | "number" | "object" | "function" | "absent" };

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
  const has = (kind: Member["kind"]) => members.some((member) => member.kind === kind);
  if (options.length > 0 && options.every((option) => typeof option === "boolean")) {
    if (members.every((member) => member.kind === "literal" || member.kind === "absent")) {
      return { type: "boolean" };
    }
  } else if (options.length > 0) {
    return { type: "select", options };
  }
  if (has("text")) return { type: "text" };
  if (has("number")) return { type: "number" };
  if (has("object")) return { type: "object" };
  return { type: false };
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

function propOf(program: Program, symbol: CheckerSymbol): ComponentProp | undefined {
  const ownDeclarations = declarationsOfSymbol(symbol).filter(
    (declaration) => !isPackageFile(declaration.getSourceFile().fileName),
  );
  const declared = program.checker.getTypeOfSymbol(symbol);
  if (ownDeclarations.length === 0 || !declared) return undefined;
  const members = unionMembers(declared).flatMap((member) => memberOf(program, member));
  if (members.every((member) => member.kind === "absent")) return undefined;
  const present = program.checker.getNonNullableType(declared) ?? declared;
  return {
    name: symbol.name,
    control: controlOf(members),
    type: program.checker.typeToString(constrained(program, present)),
    required: (symbol.flags & SymbolFlags.Optional) === 0,
    declaredBy: ownerName(ownDeclarations[0]),
  };
}

export function propsOfComponent(program: Program, name: ts.Identifier): ComponentProp[] {
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
      const prop = propOf(program, symbol);
      if (prop) found.set(prop.name, prop);
    }
  }
  return [...found.values()];
}
