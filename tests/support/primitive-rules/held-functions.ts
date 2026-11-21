import {
  calledDeclaration,
  declarationsOf,
  isPackageFile,
  isDefaultLibraryFile,
  fileOf,
  memberDeclarations,
  nameOf,
  stringsIn,
  ts,
  unwrapped,
} from "#/scripts/syntax.ts";
import {
  isDefaultLibraryDeclarationNamed,
  type Library,
} from "#/tests/support/primitive-rules/library.ts";

const callsItsTarget = ["call", "apply"];

const bindsItsTarget = "bind";

const assigningOperators: readonly ts.SyntaxKind[] = [
  ts.SyntaxKind.EqualsToken,
  ts.SyntaxKind.QuestionQuestionEqualsToken,
  ts.SyntaxKind.BarBarEqualsToken,
  ts.SyntaxKind.AmpersandAmpersandEqualsToken,
];

export type FunctionNode = ts.Node & {
  body?: ts.Node;
  parameters?: readonly ts.ParameterDeclaration[];
};

export function isFunctionNode(node: ts.Node): node is FunctionNode {
  return (
    ts.isArrowFunction(node) ||
    ts.isFunctionExpression(node) ||
    ts.isFunctionDeclaration(node) ||
    ts.isMethodDeclaration(node) ||
    ts.isGetAccessorDeclaration(node) ||
    ts.isSetAccessorDeclaration(node) ||
    ts.isConstructorDeclaration(node)
  );
}

export function inSource(node: ts.Node): boolean {
  return !isPackageFile(fileOf(node)) && !isDefaultLibraryFile(fileOf(node));
}

export function outermost(node: ts.Node): ts.Node {
  const parent = node.parent;
  return parent !== undefined && ts.isParenthesizedExpression(parent) ? outermost(parent) : node;
}

export function initializerOf(node: ts.Node): ts.Expression | undefined {
  return ts.isVariableDeclaration(node) ||
    ts.isParameterDeclaration(node) ||
    ts.isPropertyDeclaration(node) ||
    ts.isPropertyAssignment(node)
    ? node.initializer
    : undefined;
}

export function parametersOf(node: ts.Node | undefined): readonly ts.ParameterDeclaration[] {
  if (node === undefined) return [];
  if (isFunctionNode(node)) return node.parameters ?? [];
  return ts.isSignatureDeclaration(node) ? node.parameters : [];
}

type CallLike = ts.CallExpression | ts.NewExpression;

export function callTaking(node: ts.Node): { call: CallLike; index: number } | undefined {
  const call = node.parent;
  if (call === undefined || !(ts.isCallExpression(call) || ts.isNewExpression(call))) {
    return undefined;
  }
  const index = (call.arguments ?? []).findIndex((argument) => argument === node);
  return index === -1 ? undefined : { call, index };
}

export function enclosingFunction(node: ts.Node): FunctionNode | undefined {
  const parent = node.parent;
  if (parent === undefined) return undefined;
  return isFunctionNode(parent) ? parent : enclosingFunction(parent);
}

function returnsOf(node: ts.Node): ts.Expression[] {
  if (isFunctionNode(node)) return [];
  if (ts.isReturnStatement(node)) return node.expression ? [node.expression] : [];
  const found: ts.Expression[] = [];
  node.forEachChild((child) => {
    found.push(...returnsOf(child));
  });
  return found;
}

function returnedValuesOf(fn: FunctionNode): ts.Expression[] {
  const body = fn.body;
  if (body === undefined) return [];
  return ts.isExpression(body) ? [body] : returnsOf(body);
}

export function isAssignedTo(node: ts.Node): boolean {
  const parent = node.parent;
  return (
    parent !== undefined &&
    ts.isBinaryExpression(parent) &&
    parent.left === node &&
    parent.operatorToken.kind >= ts.SyntaxKind.FirstAssignment &&
    parent.operatorToken.kind <= ts.SyntaxKind.LastAssignment
  );
}

function isTheFunctionMethod(library: Library, name: ts.Node, methods: readonly string[]): boolean {
  return declarationsOf(library.compiled, name).some((declaration) =>
    isDefaultLibraryDeclarationNamed(declaration, methods),
  );
}

function boundFrom(library: Library, call: ts.CallExpression): ts.Expression | undefined {
  const callee = unwrapped(call.expression);
  return ts.isPropertyAccessExpression(callee) &&
    isTheFunctionMethod(library, callee.name, [bindsItsTarget])
    ? callee.expression
    : undefined;
}

function calleeOf(library: Library, call: ts.CallExpression): ts.Expression {
  const callee = unwrapped(call.expression);
  return ts.isPropertyAccessExpression(callee) &&
    isTheFunctionMethod(library, callee.name, callsItsTarget)
    ? callee.expression
    : callee;
}

function valueNamed(literal: ts.ObjectLiteralExpression, name: string): ts.Node | undefined {
  for (const property of literal.properties) {
    if (ts.isSpreadAssignment(property) || nameOf(property) === "") return undefined;
    if (nameOf(property) !== name) continue;
    if (ts.isPropertyAssignment(property)) return property.initializer;
    return ts.isShorthandPropertyAssignment(property) ? property.name : property;
  }
  return undefined;
}

function pairsOf(target: ts.Node, value: ts.Node): [target: ts.Node, value: ts.Node][] {
  const left = ts.isExpression(target) ? unwrapped(target) : target;
  const right = ts.isExpression(value) ? unwrapped(value) : value;
  if (ts.isArrayLiteralExpression(left)) {
    const listed = ts.isArrayLiteralExpression(right) ? right.elements : undefined;
    return left.elements.flatMap((element, index) => {
      const into = ts.isSpreadElement(element) ? element.expression : element;
      const aligned =
        listed !== undefined &&
        !ts.isSpreadElement(element) &&
        !listed.slice(0, index + 1).some(ts.isSpreadElement);
      const from = aligned ? listed[index] : right;
      return from === undefined ? [] : pairsOf(into, from);
    });
  }
  if (ts.isObjectLiteralExpression(left)) {
    return left.properties.flatMap((property) => {
      const into = ts.isPropertyAssignment(property)
        ? property.initializer
        : ts.isShorthandPropertyAssignment(property)
          ? property.name
          : ts.isSpreadAssignment(property)
            ? property.expression
            : undefined;
      if (into === undefined) return [];
      const named =
        !ts.isSpreadAssignment(property) && ts.isObjectLiteralExpression(right)
          ? valueNamed(right, nameOf(property))
          : undefined;
      const fallback =
        ts.isShorthandPropertyAssignment(property) && property.objectAssignmentInitializer
          ? pairsOf(into, property.objectAssignmentInitializer)
          : [];
      return [...pairsOf(into, named ?? right), ...fallback];
    });
  }
  return [[left, value]];
}

function iteratedValues(iterated: ts.Expression): ts.Node[] {
  const value = unwrapped(iterated);
  return ts.isArrayLiteralExpression(value) && !value.elements.some(ts.isSpreadElement)
    ? [...value.elements]
    : [value];
}

function assignedPairsOf(node: ts.Node): [target: ts.Node, value: ts.Node][] {
  if (ts.isBinaryExpression(node) && assigningOperators.includes(node.operatorToken.kind)) {
    return pairsOf(node.left, node.right);
  }
  if (ts.isForOfStatement(node) && !ts.isVariableDeclarationList(node.initializer)) {
    const target = node.initializer;
    return iteratedValues(node.expression).flatMap((value) => pairsOf(target, value));
  }
  return [];
}

function targetDeclarations(library: Library, target: ts.Node): ts.Node[] {
  const parent = target.parent;
  return parent !== undefined && ts.isShorthandPropertyAssignment(parent) && parent.name === target
    ? declarationsOf(library.compiled, target)
    : memberDeclarations(library.compiled, target);
}

const assignmentIndexes = new WeakMap<
  Library["compiled"],
  WeakMap<ts.SourceFile, Map<ts.Node, ts.Node[]>>
>();

function assignmentIndexOf(library: Library, source: ts.SourceFile): Map<ts.Node, ts.Node[]> {
  const ofProgram = assignmentIndexes.get(library.compiled) ?? new WeakMap();
  assignmentIndexes.set(library.compiled, ofProgram);
  const known = ofProgram.get(source);
  if (known !== undefined) return known;
  const index = new Map<ts.Node, ts.Node[]>();
  const look = (node: ts.Node): void => {
    for (const [target, value] of assignedPairsOf(node)) {
      for (const declaration of targetDeclarations(library, target)) {
        index.set(declaration, [...(index.get(declaration) ?? []), value]);
      }
    }
    node.forEachChild(look);
  };
  look(source);
  ofProgram.set(source, index);
  return index;
}

function valuesAssignedTo(library: Library, declaration: ts.Node): ts.Node[] {
  const sources = new Set([
    declaration.getSourceFile(),
    ...library.modules.map(({ source }) => source),
  ]);
  return [...sources].flatMap(
    (source) => assignmentIndexOf(library, source).get(declaration) ?? [],
  );
}

export const nothingPruned: ReadonlySet<string> = new Set();

type Resolution = {
  library: Library;
  seen: Set<ts.Node>;
  pruned: ReadonlySet<string>;
  plain?: Resolution;
};

export function resolution(
  library: Library,
  pruned: ReadonlySet<string> = nothingPruned,
): Resolution {
  return { library, seen: new Set(), pruned };
}

function withoutPruning(from: Resolution): Resolution {
  if (from.pruned.size === 0) return from;
  from.plain ??= resolution(from.library);
  return from.plain;
}

function functionsOfMember(resolution: Resolution, member: ts.Node): FunctionNode[] {
  if (ts.isPropertyAssignment(member)) return functionsItMayBe(resolution, member.initializer);
  if (ts.isShorthandPropertyAssignment(member)) {
    return functionsHeldBy(resolution, declarationsOf(resolution.library.compiled, member.name));
  }
  if (ts.isSpreadAssignment(member)) return functionsItMayBe(resolution, member.expression);
  return isFunctionNode(member) && member.body !== undefined ? [member] : [];
}

export function holderLiterals(
  resolution: Resolution,
  expression: ts.Node,
): ts.ObjectLiteralExpression[] | undefined {
  const value = ts.isExpression(expression) ? unwrapped(expression) : expression;
  if (ts.isObjectLiteralExpression(value)) {
    return value.properties.some(
      (property) => ts.isSpreadAssignment(property) || nameOf(property) === "",
    )
      ? undefined
      : [value];
  }
  const { library } = resolution;
  const declarations = memberDeclarations(library.compiled, value);
  if (
    declarations.length === 0 ||
    !declarations.every(
      (declaration) => ts.isVariableDeclaration(declaration) && inSource(declaration),
    )
  ) {
    return undefined;
  }
  const routes = declarations.flatMap((declaration) => [
    ...[initializerOf(declaration)].filter((route) => route !== undefined),
    ...valuesAssignedTo(library, declaration),
  ]);
  const literals = routes.map((route) =>
    ts.isExpression(route) && ts.isObjectLiteralExpression(unwrapped(route))
      ? holderLiterals(resolution, route)
      : undefined,
  );
  return routes.length > 0 && literals.every((found) => found !== undefined)
    ? literals.flat()
    : undefined;
}

export function membersNamed(
  literals: readonly ts.ObjectLiteralExpression[],
  names: readonly string[],
): ts.ObjectLiteralElementLike[] {
  return literals.flatMap((literal) =>
    literal.properties.filter((property) => names.includes(nameOf(property))),
  );
}

function memberNamesOf(
  library: Library,
  access: ts.PropertyAccessExpression | ts.ElementAccessExpression,
): string[] | undefined {
  if (ts.isPropertyAccessExpression(access)) return [access.name.text];
  const names = stringsIn(library.compiled, access.argumentExpression);
  return names.length > 0 ? names : undefined;
}

function functionsInMember(
  resolution: Resolution,
  access: ts.PropertyAccessExpression | ts.ElementAccessExpression,
): FunctionNode[] {
  const names = memberNamesOf(resolution.library, access);
  const holders = names && holderLiterals(resolution, access.expression);
  if (names === undefined || holders === undefined) {
    return functionsItMayBe(resolution, access.expression);
  }
  return membersNamed(holders, names).flatMap((member) => functionsOfMember(resolution, member));
}

export function functionsItMayBe(resolution: Resolution, expression: ts.Node): FunctionNode[] {
  const value = ts.isExpression(expression) ? unwrapped(expression) : expression;
  if (resolution.seen.has(value)) return [];
  resolution.seen.add(value);
  const { library } = resolution;
  const may = (next: ts.Node) => functionsItMayBe(resolution, next);
  if (isFunctionNode(value)) return value.body && inSource(value) ? [value] : [];
  if (ts.isConditionalExpression(value)) return [...may(value.whenTrue), ...may(value.whenFalse)];
  if (ts.isBinaryExpression(value)) {
    return value.operatorToken.kind === ts.SyntaxKind.CommaToken
      ? may(value.right)
      : [...may(value.left), ...may(value.right)];
  }
  if (ts.isCallExpression(value)) {
    const target = boundFrom(library, value);
    if (target !== undefined) return may(target);
    return functionsACallRuns(resolution, value).flatMap((fn) => returnedValuesOf(fn).flatMap(may));
  }
  if (ts.isSpreadElement(value)) return may(value.expression);
  if (ts.isArrayLiteralExpression(value)) return value.elements.flatMap(may);
  if (ts.isObjectLiteralExpression(value)) {
    const inner = withoutPruning(resolution);
    return value.properties.flatMap((property) =>
      !ts.isGetAccessorDeclaration(property) && resolution.pruned.has(nameOf(property))
        ? []
        : functionsOfMember(inner, property),
    );
  }
  const declarations = memberDeclarations(library.compiled, value);
  const held = functionsHeldBy(resolution, declarations);
  if (held.length > 0) return held;
  if (
    (ts.isPropertyAccessExpression(value) || ts.isElementAccessExpression(value)) &&
    declarations.every(inSource)
  ) {
    return functionsInMember(resolution, value);
  }
  return [];
}

function iteratedBy(declaration: ts.Node): ts.Expression | undefined {
  const list = declaration.parent;
  const loop = list?.parent;
  return ts.isVariableDeclaration(declaration) &&
    list !== undefined &&
    loop !== undefined &&
    ts.isForOfStatement(loop) &&
    loop.initializer === list
    ? loop.expression
    : undefined;
}

function receiverIteratedBy(declaration: ts.Node): ts.Expression | undefined {
  if (!ts.isParameterDeclaration(declaration)) return undefined;
  const callback = outermost(declaration.parent);
  const taken = callTaking(callback);
  if (taken === undefined || !ts.isCallExpression(taken.call)) return undefined;
  const method = unwrapped(taken.call.expression);
  return ts.isPropertyAccessExpression(method) ? method.expression : undefined;
}

function functionsHeldBy(resolution: Resolution, declarations: readonly ts.Node[]): FunctionNode[] {
  const { library } = resolution;
  const may = (next: ts.Node) => functionsItMayBe(resolution, next);
  return declarations.flatMap((declaration) => {
    if (!inSource(declaration)) return [];
    if (isFunctionNode(declaration)) return declaration.body ? [declaration] : [];
    if (ts.isBindingElement(declaration)) {
      return functionsHeldBy(resolution, memberDeclarations(library.compiled, declaration));
    }
    const iterated = iteratedBy(declaration) ?? receiverIteratedBy(declaration);
    const initializer = initializerOf(declaration);
    return [
      ...(initializer ? may(initializer) : []),
      ...(iterated ? may(iterated) : []),
      ...valuesAssignedTo(library, declaration).flatMap(may),
    ];
  });
}

export function functionsACallRuns(
  resolution: Resolution,
  call: ts.CallExpression,
): FunctionNode[] {
  const { library } = resolution;
  if (boundFrom(library, call) !== undefined) return [];
  const resolved = calledDeclaration(library.compiled, call);
  return [
    ...(resolved ? functionsHeldBy(resolution, [resolved]) : []),
    ...functionsItMayBe(resolution, calleeOf(library, call)),
  ];
}
