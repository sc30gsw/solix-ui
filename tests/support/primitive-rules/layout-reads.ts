import { basename, join } from "node:path";
import {
  calledDeclaration,
  declarationsOf,
  findAncestor,
  fileOf,
  isDefaultLibraryFile,
  isPackageFile,
  memberDeclarations,
  nameOf,
  stringsIn,
  ts,
  unwrapped,
} from "#/scripts/syntax.ts";
import { type Home, repositoryRoot } from "#/tests/support/workspace.ts";
import {
  calleeName,
  type Declared,
  exportedFunctions,
  isInHome,
  type Library,
  located,
  type PrimitiveRule,
  publicModules,
  refersToDomMember,
} from "#/tests/support/primitive-rules/library.ts";

export const layoutMembers: readonly string[] = Object.freeze([
  "scrollX",
  "scrollY",
  "pageXOffset",
  "pageYOffset",
  "scrollTop",
  "scrollLeft",
  "scrollWidth",
  "scrollHeight",
  "getBoundingClientRect",
  "getClientRects",
  "offsetTop",
  "offsetLeft",
  "offsetWidth",
  "offsetHeight",
  "offsetParent",
  "clientTop",
  "clientLeft",
  "clientWidth",
  "clientHeight",
  "innerWidth",
  "innerHeight",
  "visualViewport",
  "innerText",
  "outerText",
  "getComputedStyle",
  "computedStyleMap",
  "checkVisibility",
  "getBBox",
  "getCTM",
  "getScreenCTM",
  "elementFromPoint",
  "elementsFromPoint",
  "caretPositionFromPoint",
]);

const descriptorReaders = ["getOwnPropertyDescriptor"];

const followers: readonly Home[] = [
  { file: "internal-scroll.ts" },
  { file: "create-window-scroll.ts" },
  { file: "create-viewport-size.ts" },
];

export type LayoutReadExemption = Required<Home> & { reason: string };

export const layoutReadExemptions: readonly LayoutReadExemption[] = [
  {
    file: "create-focus-trap.ts",
    fn: "focusInitially",
    reason:
      "it runs on the next task after the trap turns on and reads the layout once, to pick the element it focuses and to decide whether that element lies outside the viewport, as the browser's own focus does; it keeps neither answer, and a later move of focus reads the layout again",
  },
];

const primitivesSource = join(repositoryRoot, "packages/primitives/src");
const runsLaterTypes: readonly Declared[] = [
  { file: join(primitivesSource, "internal-listener.ts"), name: "Listener" },
  { file: join(primitivesSource, "internal-dom-observer.ts"), name: "ObserverReport" },
];

type CallbackTakerExemption = Declared & { reason: string };

const callbackTakerExemptions: readonly CallbackTakerExemption[] = [
  {
    file: join(primitivesSource, "internal-dom-observer.ts"),
    name: "ObserverClass",
    reason:
      "it types the browser's own observer constructor, which observe looks up on the target's window and so has no body in source; the browser runs the ObserverReport it is given only to report a change it observed, never as the constructor runs",
  },
];

const handsOnToTheDom = ["addEventListener", "removeEventListener"];
const callsItsTarget = ["call", "apply"];
const bindsItsTarget = "bind";
const assigningOperators: readonly ts.SyntaxKind[] = [
  ts.SyntaxKind.EqualsToken,
  ts.SyntaxKind.QuestionQuestionEqualsToken,
  ts.SyntaxKind.BarBarEqualsToken,
  ts.SyntaxKind.AmpersandAmpersandEqualsToken,
];
const passingOnOperators: readonly ts.SyntaxKind[] = [
  ts.SyntaxKind.QuestionQuestionToken,
  ts.SyntaxKind.BarBarToken,
];
const comparingOperators: readonly ts.SyntaxKind[] = [
  ts.SyntaxKind.EqualsEqualsEqualsToken,
  ts.SyntaxKind.ExclamationEqualsEqualsToken,
  ts.SyntaxKind.EqualsEqualsToken,
  ts.SyntaxKind.ExclamationEqualsToken,
];

type FunctionNode = ts.Node & {
  body?: ts.Node;
  parameters?: readonly ts.ParameterDeclaration[];
};

function isFunctionNode(node: ts.Node): node is FunctionNode {
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

function inSource(node: ts.Node): boolean {
  return !isPackageFile(fileOf(node)) && !isDefaultLibraryFile(fileOf(node));
}

function outermost(node: ts.Node): ts.Node {
  const parent = node.parent;
  return parent !== undefined && ts.isParenthesizedExpression(parent) ? outermost(parent) : node;
}

function initializerOf(node: ts.Node): ts.Expression | undefined {
  return ts.isVariableDeclaration(node) ||
    ts.isParameterDeclaration(node) ||
    ts.isPropertyDeclaration(node) ||
    ts.isPropertyAssignment(node)
    ? node.initializer
    : undefined;
}

function parametersOf(node: ts.Node | undefined): readonly ts.ParameterDeclaration[] {
  if (node === undefined) return [];
  if (isFunctionNode(node)) return node.parameters ?? [];
  return ts.isSignatureDeclaration(node) ? node.parameters : [];
}

type CallLike = ts.CallExpression | ts.NewExpression;

function callTaking(node: ts.Node): { call: CallLike; index: number } | undefined {
  const call = node.parent;
  if (call === undefined || !(ts.isCallExpression(call) || ts.isNewExpression(call))) {
    return undefined;
  }
  const index = (call.arguments ?? []).findIndex((argument) => argument === node);
  return index === -1 ? undefined : { call, index };
}

type Later = {
  library: Library;
  relied: Set<ts.Node>;
  watched: Map<ts.Node, boolean>;
};

function isARunsLaterType(library: Library, type: ts.Node): boolean {
  if (!ts.isTypeReferenceNode(type)) return false;
  return declarationsOf(library.compiled, type.typeName).some(
    (declaration) =>
      ts.isTypeAliasDeclaration(declaration) &&
      runsLaterTypes.some(
        ({ file, name }) => fileOf(declaration) === file && nameOf(declaration) === name,
      ),
  );
}

function isAbsent(type: ts.Node): boolean {
  return (
    type.kind === ts.SyntaxKind.UndefinedKeyword ||
    (ts.isLiteralTypeNode(type) && type.literal.kind === ts.SyntaxKind.NullKeyword)
  );
}

function declaresRunsLater(library: Library, type: ts.Node | undefined): boolean {
  if (type === undefined) return false;
  if (ts.isParenthesizedTypeNode(type)) return declaresRunsLater(library, type.type);
  if (ts.isUnionTypeNode(type)) {
    const present = type.types.filter((member) => !isAbsent(member));
    return present.length > 0 && present.every((member) => declaresRunsLater(library, member));
  }
  return isARunsLaterType(library, type);
}

function isWatched(later: Later, declaration: ts.Node): boolean {
  const known = later.watched.get(declaration);
  if (known !== undefined) return known;
  const { library } = later;
  const watched =
    inSource(declaration) &&
    ((ts.isParameterDeclaration(declaration) &&
      declaresRunsLater(library, declaration.type) &&
      isFunctionNode(declaration.parent) &&
      declaration.parent.body !== undefined) ||
      (ts.isPropertySignatureDeclaration(declaration) &&
        declaresRunsLater(library, declaration.type)));
  later.watched.set(declaration, watched);
  return watched;
}

function implementationOf(library: Library, called: ts.Node | undefined): FunctionNode | undefined {
  if (called === undefined || !inSource(called) || !isFunctionNode(called)) return undefined;
  if (called.body !== undefined) return called;
  const overloads = ts.isConstructorDeclaration(called)
    ? ts.isClassLikeDeclaration(called.parent)
      ? [...called.parent.members]
      : []
    : (ts.isFunctionDeclaration(called) || ts.isMethodDeclaration(called)) && called.name
      ? declarationsOf(library.compiled, called.name)
      : [];
  return overloads.find(
    (overload): overload is FunctionNode =>
      overload.kind === called.kind && isFunctionNode(overload) && overload.body !== undefined,
  );
}

function isACallbackTakerExemption(called: ts.Node | undefined): boolean {
  const alias = findAncestor(called, ts.isTypeAliasDeclaration);
  return (
    alias !== undefined &&
    callbackTakerExemptions.some(
      ({ file, name }) => fileOf(alias) === file && nameOf(alias) === name,
    )
  );
}

function typeMembersOf(library: Library, type: ts.Node | undefined): readonly ts.Node[] {
  if (type === undefined) return [];
  if (ts.isTypeLiteralNode(type)) return type.members;
  if (!ts.isTypeReferenceNode(type)) return [];
  return declarationsOf(library.compiled, type.typeName).flatMap((declaration) => {
    if (!inSource(declaration)) return [];
    if (ts.isInterfaceDeclaration(declaration)) return [...declaration.members];
    return ts.isTypeAliasDeclaration(declaration) ? typeMembersOf(library, declaration.type) : [];
  });
}

function propertiesThatRunLater(later: Later, type: ts.Node | undefined): ReadonlySet<string> {
  const names = new Set<string>();
  for (const member of typeMembersOf(later.library, type)) {
    if (ts.isPropertySignatureDeclaration(member) && isWatched(later, member)) {
      later.relied.add(member);
      names.add(nameOf(member));
    }
  }
  return names;
}

type RunsNow = { pruned: ReadonlySet<string> };

const nothingPruned: ReadonlySet<string> = new Set();
const runsNow: RunsNow = { pruned: nothingPruned };

function argumentPosition(later: Later, node: ts.Node): "later" | RunsNow | undefined {
  const taken = callTaking(outermost(node));
  if (taken === undefined) return undefined;
  const { call, index } = taken;
  if ((call.arguments ?? []).slice(0, index + 1).some(ts.isSpreadElement)) return runsNow;
  const called = calledDeclaration(later.library.compiled, call);
  if (isACallbackTakerExemption(called)) {
    return declaresRunsLater(later.library, parametersOf(called)[index]?.type) ? "later" : runsNow;
  }
  const parameter = parametersOf(implementationOf(later.library, called))[index];
  if (parameter === undefined) return runsNow;
  if (isWatched(later, parameter)) {
    later.relied.add(parameter);
    return "later";
  }
  return { pruned: propertiesThatRunLater(later, parameter.type) };
}

function runsLaterWhereItIs(later: Later, node: ts.Node): boolean {
  return argumentPosition(later, node) === "later";
}

function runsNowWhereItIs(later: Later, node: ts.Node): RunsNow | undefined {
  const position = argumentPosition(later, node);
  return position === "later" ? undefined : position;
}

function isAPropertyThatRunsLater(later: Later, property: ts.Node): boolean {
  if (!ts.isPropertyAssignment(property) && !ts.isMethodDeclaration(property)) return false;
  const typed = declarationsOf(later.library.compiled, property.name).filter(
    (declaration) => declaration !== property,
  );
  const runsLater =
    typed.length > 0 &&
    typed.every(
      (declaration) =>
        ts.isPropertySignatureDeclaration(declaration) && isWatched(later, declaration),
    );
  if (runsLater) for (const declaration of typed) later.relied.add(declaration);
  return runsLater;
}

function runsWhereItStands(later: Later, fn: ts.Node): boolean {
  const outer = outermost(fn);
  const parent = outer.parent;
  if (parent === undefined) return false;
  if (ts.isCallExpression(parent) && parent.expression === outer) return true;
  if (ts.isParameterDeclaration(parent) && parent.initializer === outer) return true;
  return runsNowWhereItIs(later, fn) !== undefined;
}

function nameOfFunction(fn: ts.Node): string {
  const parent = fn.parent;
  if (
    (ts.isArrowFunction(fn) || ts.isFunctionExpression(fn)) &&
    parent !== undefined &&
    ts.isVariableDeclaration(parent)
  ) {
    return nameOf(parent);
  }
  return nameOf(fn);
}

function exemptionOf(
  fn: ts.Node,
  exemptions: readonly LayoutReadExemption[],
): LayoutReadExemption | undefined {
  const file = basename(fileOf(fn));
  const name = nameOfFunction(fn);
  return exemptions.find((exemption) => exemption.file === file && exemption.fn === name);
}

function readsDescriptorOfALayoutMember(library: Library, node: ts.Node): boolean {
  if (!ts.isCallExpression(node)) return false;
  const reader = declarationsOf(library.compiled, calleeName(node.expression));
  return (
    reader.some(
      (declaration) =>
        isDefaultLibraryFile(fileOf(declaration)) &&
        descriptorReaders.includes(nameOf(declaration)),
    ) && stringsIn(library.compiled, node.arguments[1]).some((name) => layoutMembers.includes(name))
  );
}

export function readsLayout(library: Library, node: ts.Node): boolean {
  return (
    refersToDomMember(library, node, (declaration) =>
      layoutMembers.includes(nameOf(declaration)),
    ) || readsDescriptorOfALayoutMember(library, node)
  );
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

function isAssignedTo(node: ts.Node): boolean {
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
  return declarationsOf(library.compiled, name).some(
    (declaration) =>
      isDefaultLibraryFile(fileOf(declaration)) && methods.includes(nameOf(declaration)),
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
      return pairsOf(into, named ?? right);
    });
  }
  return [[left, value]];
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
    if (ts.isBinaryExpression(node) && assigningOperators.includes(node.operatorToken.kind)) {
      for (const [target, value] of pairsOf(node.left, node.right)) {
        for (const declaration of targetDeclarations(library, target)) {
          index.set(declaration, [...(index.get(declaration) ?? []), value]);
        }
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

type Resolution = {
  later: Later;
  seen: Set<ts.Node>;
  pruned: ReadonlySet<string>;
  plain?: Resolution;
};

function resolution(later: Later, pruned: ReadonlySet<string> = nothingPruned): Resolution {
  return { later, seen: new Set(), pruned };
}

function withoutPruning(from: Resolution): Resolution {
  if (from.pruned.size === 0) return from;
  from.plain ??= resolution(from.later);
  return from.plain;
}

function functionsOfMember(resolution: Resolution, member: ts.Node): FunctionNode[] {
  if (ts.isPropertyAssignment(member)) return functionsItMayBe(resolution, member.initializer);
  if (ts.isShorthandPropertyAssignment(member)) {
    return functionsHeldBy(
      resolution,
      declarationsOf(resolution.later.library.compiled, member.name),
    );
  }
  if (ts.isSpreadAssignment(member)) return functionsItMayBe(resolution, member.expression);
  return isFunctionNode(member) && member.body !== undefined ? [member] : [];
}

function holderLiterals(
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
  const { library } = resolution.later;
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

function membersNamed(
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
  const names = memberNamesOf(resolution.later.library, access);
  const holders = names && holderLiterals(resolution, access.expression);
  if (names === undefined || holders === undefined) {
    return functionsItMayBe(resolution, access.expression);
  }
  return membersNamed(holders, names).flatMap((member) => functionsOfMember(resolution, member));
}

function functionsItMayBe(resolution: Resolution, expression: ts.Node): FunctionNode[] {
  const value = ts.isExpression(expression) ? unwrapped(expression) : expression;
  if (resolution.seen.has(value)) return [];
  resolution.seen.add(value);
  const { library } = resolution.later;
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
      resolution.pruned.has(nameOf(property)) ||
      isAPropertyThatRunsLater(resolution.later, property)
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
  const { library } = resolution.later;
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

function functionsACallRuns(resolution: Resolution, call: ts.CallExpression): FunctionNode[] {
  const { library } = resolution.later;
  if (boundFrom(library, call) !== undefined) return [];
  const resolved = calledDeclaration(library.compiled, call);
  return [
    ...(resolved ? functionsHeldBy(resolution, [resolved]) : []),
    ...functionsItMayBe(resolution, calleeOf(library, call)),
  ];
}

type Walk = {
  library: Library;
  later: Later;
  exemptions: readonly LayoutReadExemption[];
  reads: Set<ts.Node>;
  readsOfExemptions: Map<LayoutReadExemption, Set<ts.Node>>;
  visited: Set<string>;
};

function runFunction(walk: Walk, fn: FunctionNode, under: LayoutReadExemption | undefined): void {
  const exemption = under ?? exemptionOf(fn, walk.exemptions);
  const key = `${fileOf(fn)}:${fn.pos}:${exemption ? `${exemption.file}#${exemption.fn}` : ""}`;
  if (walk.visited.has(key)) return;
  walk.visited.add(key);
  if (exemption && !walk.readsOfExemptions.has(exemption)) {
    walk.readsOfExemptions.set(exemption, new Set());
  }
  for (const parameter of fn.parameters ?? []) visit(walk, parameter, exemption);
  if (fn.body) visit(walk, fn.body, exemption);
}

function runEach(
  walk: Walk,
  fns: readonly FunctionNode[],
  under: LayoutReadExemption | undefined,
): void {
  for (const fn of fns) runFunction(walk, fn, under);
}

function classChainOf(walk: Walk, declaration: ts.Node): ts.Node[] {
  if (!ts.isClassLikeDeclaration(declaration) || !inSource(declaration)) return [];
  const bases = (declaration.heritageClauses ?? [])
    .flatMap((clause) => clause.types)
    .flatMap((base) => declarationsOf(walk.library.compiled, unwrapped(base.expression)));
  return [declaration, ...bases.flatMap((base) => classChainOf(walk, base))];
}

function classesCreatedBy(walk: Walk, created: ts.Expression): ts.Node[] {
  return memberDeclarations(walk.library.compiled, unwrapped(created)).flatMap((declaration) =>
    classChainOf(walk, declaration),
  );
}

function createInstancesOf(
  walk: Walk,
  created: ts.Expression,
  under: LayoutReadExemption | undefined,
): void {
  for (const declaration of classesCreatedBy(walk, created)) {
    if (!ts.isClassLikeDeclaration(declaration)) continue;
    for (const member of declaration.members) {
      if (ts.isConstructorDeclaration(member)) runFunction(walk, member, under);
      else if (ts.isPropertyDeclaration(member) && member.initializer) {
        visit(walk, member.initializer, under);
      } else if (ts.isClassStaticBlockDeclaration(member)) visit(walk, member, under);
    }
  }
}

function accessorsRunBy(walk: Walk, node: ts.Node): FunctionNode[] {
  const wanted = isAssignedTo(node) ? ts.isSetAccessorDeclaration : ts.isGetAccessorDeclaration;
  return memberDeclarations(walk.library.compiled, node).filter(
    (declaration): declaration is FunctionNode =>
      wanted(declaration) && inSource(declaration) && declaration.body !== undefined,
  );
}

function gettersOf(members: readonly ts.ObjectLiteralElementLike[]): FunctionNode[] {
  return members.filter(
    (member): member is ts.ObjectLiteralElementLike & FunctionNode =>
      ts.isGetAccessorDeclaration(member) && member.body !== undefined,
  );
}

function gettersSpreadBy(walk: Walk, spread: ts.Expression): FunctionNode[] {
  const holders = holderLiterals(resolution(walk.later), spread) ?? [];
  return gettersOf(holders.flatMap((literal) => [...literal.properties]));
}

function gettersDestructuredBy(walk: Walk, binding: ts.Node): FunctionNode[] {
  if (!ts.isBindingElement(binding) || !ts.isObjectBindingPattern(binding.parent)) return [];
  const key: ts.Node | undefined = binding.propertyName ?? binding.name;
  const name = key !== undefined && ts.isIdentifier(key) ? key.text : undefined;
  const source = initializerOf(binding.parent.parent);
  if (name === undefined || source === undefined) return [];
  const holders = holderLiterals(resolution(walk.later), source) ?? [];
  return gettersOf(membersNamed(holders, [name]));
}

function visit(walk: Walk, node: ts.Node, under: LayoutReadExemption | undefined): void {
  if (isFunctionNode(node)) {
    if (runsWhereItStands(walk.later, node)) runFunction(walk, node, under);
    return;
  }
  if (ts.isClassLikeDeclaration(node)) return;
  if (readsLayout(walk.library, node)) {
    const bucket = under ? walk.readsOfExemptions.get(under) : walk.reads;
    bucket?.add(node);
  }
  if (ts.isCallExpression(node)) {
    runEach(walk, functionsACallRuns(resolution(walk.later), node), under);
  }
  if (ts.isTaggedTemplateExpression(node)) {
    runEach(walk, functionsItMayBe(resolution(walk.later), node.tag), under);
  }
  if (ts.isNewExpression(node)) createInstancesOf(walk, node.expression, under);
  if (
    ts.isPropertyAccessExpression(node) ||
    ts.isElementAccessExpression(node) ||
    (ts.isBindingElement(node) && ts.isObjectBindingPattern(node.parent))
  ) {
    runEach(walk, accessorsRunBy(walk, node), under);
  }
  runEach(walk, gettersDestructuredBy(walk, node), under);
  if (ts.isSpreadAssignment(node) || ts.isSpreadElement(node)) {
    runEach(walk, gettersSpreadBy(walk, node.expression), under);
  }
  const position = ts.isExpression(node) ? runsNowWhereItIs(walk.later, node) : undefined;
  if (position !== undefined) {
    runEach(walk, functionsItMayBe(resolution(walk.later, position.pruned), node), under);
  }
  node.forEachChild((child) => visit(walk, child, under));
}

function enclosingFunction(node: ts.Node): FunctionNode | undefined {
  const parent = node.parent;
  if (parent === undefined) return undefined;
  return isFunctionNode(parent) ? parent : enclosingFunction(parent);
}

function isHandedOnToTheDom(library: Library, argument: ts.Node): boolean {
  const taken = callTaking(outermost(argument));
  return (
    taken !== undefined &&
    ts.isCallExpression(taken.call) &&
    refersToDomMember(library, unwrapped(taken.call.expression), (declaration) =>
      handsOnToTheDom.includes(nameOf(declaration)),
    )
  );
}

const namedNodes = new WeakMap<ts.SourceFile, Map<string, ts.Node[]>>();

function namedNodesIn(source: ts.SourceFile): Map<string, ts.Node[]> {
  const known = namedNodes.get(source);
  if (known !== undefined) return known;
  const found = new Map<string, ts.Node[]>();
  const add = (name: string, node: ts.Node): void => {
    found.set(name, [...(found.get(name) ?? []), node]);
  };
  const look = (node: ts.Node): void => {
    if (ts.isIdentifier(node)) add(node.text, node);
    if (ts.isElementAccessExpression(node) && ts.isStringLiteral(node.argumentExpression)) {
      add(node.argumentExpression.text, node);
    }
    node.forEachChild(look);
  };
  look(source);
  namedNodes.set(source, found);
  return found;
}

function declarationsReferredBy(library: Library, node: ts.Node): ts.Node[] {
  const parent = node.parent;
  if (ts.isElementAccessExpression(node)) return memberDeclarations(library.compiled, node);
  if (
    parent !== undefined &&
    ts.isBindingElement(parent) &&
    ts.isObjectBindingPattern(parent.parent) &&
    (parent.propertyName ?? parent.name) === node
  ) {
    return memberDeclarations(library.compiled, parent);
  }
  return declarationsOf(library.compiled, node);
}

function definesIt(node: ts.Node, declaration: ts.Node): boolean {
  const parent = node.parent;
  if (parent === undefined || parent === declaration) return parent !== undefined;
  if (
    (ts.isPropertyAssignment(parent) ||
      ts.isMethodDeclaration(parent) ||
      ts.isGetAccessorDeclaration(parent) ||
      ts.isSetAccessorDeclaration(parent)) &&
    parent.name === node
  ) {
    return true;
  }
  return (
    ts.isShorthandPropertyAssignment(parent) &&
    parent.name === node &&
    !ts.isParameterDeclaration(declaration)
  );
}

function referencesTo(later: Later, declaration: ts.Node): ts.Node[] {
  const name = nameOf(declaration);
  if (name === "") return [];
  const sources = new Set([
    declaration.getSourceFile(),
    ...later.library.modules.map(({ source }) => source),
  ]);
  return [...sources]
    .flatMap((source) => namedNodesIn(source).get(name) ?? [])
    .filter(
      (node) =>
        !definesIt(node, declaration) &&
        declarationsReferredBy(later.library, node).includes(declaration),
    );
}

function passedOnFrom(node: ts.Node): ts.Node {
  const parent = node.parent;
  if (parent === undefined) return node;
  if (
    ts.isParenthesizedExpression(parent) ||
    ts.isAsExpression(parent) ||
    ts.isNonNullExpression(parent) ||
    ts.isSatisfiesExpression(parent) ||
    ts.isTypeAssertion(parent) ||
    (ts.isPropertyAccessExpression(parent) && parent.name === node) ||
    (ts.isConditionalExpression(parent) && parent.condition !== node) ||
    (ts.isBinaryExpression(parent) && passingOnOperators.includes(parent.operatorToken.kind))
  ) {
    return passedOnFrom(parent);
  }
  return node;
}

function isTestedForPresence(node: ts.Node): boolean {
  const parent = node.parent;
  if (parent === undefined) return false;
  return (
    (ts.isPrefixUnaryExpression(parent) && parent.operator === ts.SyntaxKind.ExclamationToken) ||
    ts.isTypeOfExpression(parent) ||
    (ts.isBinaryExpression(parent) && comparingOperators.includes(parent.operatorToken.kind)) ||
    ((ts.isIfStatement(parent) || ts.isWhileStatement(parent)) && parent.expression === node) ||
    (ts.isConditionalExpression(parent) && parent.condition === node)
  );
}

function isOnlyHandedOn(
  later: Later,
  node: ts.Node,
  owner: ts.Node | undefined,
  followed: Set<ts.Node>,
): boolean {
  if (followed.has(node)) return false;
  followed.add(node);
  const at = passedOnFrom(node);
  if (isTestedForPresence(at)) return true;
  if (runsLaterWhereItIs(later, at) || isHandedOnToTheDom(later.library, at)) return true;
  const holder = at.parent;
  if (
    isFunctionNode(node) &&
    holder !== undefined &&
    ts.isVariableDeclaration(holder) &&
    holder.initializer === at
  ) {
    const uses = referencesTo(later, holder);
    return uses.length > 0 && uses.every((use) => isOnlyHandedOn(later, use, owner, followed));
  }
  const nested = enclosingFunction(node);
  return nested !== undefined && nested !== owner && isOnlyHandedOn(later, nested, owner, followed);
}

function watchedIn(later: Later): ts.Node[] {
  const found: ts.Node[] = [];
  for (const { source } of later.library.modules) {
    const look = (node: ts.Node): void => {
      if (isWatched(later, node)) found.push(node);
      node.forEachChild(look);
    };
    look(source);
  }
  return found;
}

function listenersRunAtOnce(later: Later): string[] {
  const checked = new Set<ts.Node>();
  const findings = new Set<string>();
  for (
    let next = watchedIn(later);
    next.length > 0;
    next = [...later.relied].filter((declaration) => !checked.has(declaration))
  ) {
    for (const declaration of next) {
      checked.add(declaration);
      const owner = ts.isParameterDeclaration(declaration) ? declaration.parent : undefined;
      for (const use of referencesTo(later, declaration)) {
        if (isOnlyHandedOn(later, use, owner, new Set())) continue;
        findings.add(
          `${located(use)}: ${use.parent.getText()}: a parameter or property typed Listener or ObserverReport is used here other than tested for presence, handed on to a Listener or ObserverReport parameter of a function with a body in source, handed on to addEventListener or removeEventListener, or used in a function only handed on so. The layout-reads walk does not enter a function given to such a parameter or property, so nothing may run that function as a primitive goes live.`,
        );
      }
    }
  }
  return [...findings];
}

function withoutFollowers(reads: Iterable<ts.Node>): ts.Node[] {
  return [...reads].filter((node) => !followers.some((home) => isInHome(node, home)));
}

export function layoutReadsRuleWith(exemptions: readonly LayoutReadExemption[]): PrimitiveRule {
  return {
    description: `what a public function runs as it goes live reads no layout member (${layoutMembers.join(", ")}) outside a listener or an observer callback, but in a module that follows the value it reads (${followers.map(({ file }) => file).join(", ")}) or in a function an exemption names with its reason`,
    rule: (library) => {
      const later: Later = { library, relied: new Set(), watched: new Map() };
      const walk: Walk = {
        library,
        later,
        exemptions,
        reads: new Set(),
        readsOfExemptions: new Map(),
        visited: new Set(),
      };
      for (const module of publicModules(library)) {
        runEach(walk, exportedFunctions(module).all, undefined);
      }
      const unexempted = withoutFollowers(walk.reads).map(
        (node) =>
          `${located(node)}: ${node.getText()}: a public primitive reads layout here as it goes live, and keeps what it read when a stylesheet or a resize changes the layout later. Read it inside a listener or an observer callback, follow the value through internal-scroll.ts, or add an exemption with its reason to layoutReadExemptions.`,
      );
      const unused = exemptions
        .filter((exemption) => library.modules.some(({ file }) => file === exemption.file))
        .filter(
          (exemption) => withoutFollowers(walk.readsOfExemptions.get(exemption) ?? []).length === 0,
        )
        .map(
          ({ file, fn }) =>
            `${file}: ${fn} reads no layout as a primitive goes live, so drop its entry from layoutReadExemptions.`,
        );
      return [...unexempted, ...unused, ...listenersRunAtOnce(later)];
    },
  };
}

export const layoutReadsRule: PrimitiveRule = layoutReadsRuleWith(layoutReadExemptions);
