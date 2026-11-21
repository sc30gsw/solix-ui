import { join } from "node:path";
import {
  calledDeclaration,
  declarationsOf,
  fileOf,
  findAncestor,
  memberDeclarations,
  nameOf,
  propertiesOfType,
  stringsIn,
  ts,
  unwrapped,
} from "#/scripts/syntax.ts";
import { repositoryRoot } from "#/tests/support/workspace.ts";
import {
  callTaking,
  enclosingFunction,
  inSource,
  isFunctionNode,
  nothingPruned,
  outermost,
  parametersOf,
  type FunctionNode,
} from "#/tests/support/primitive-rules/held-functions.ts";
import {
  type Declared,
  type Library,
  located,
  refersToDomMember,
} from "#/tests/support/primitive-rules/library.ts";

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

export type Later = {
  library: Library;
  relied: Set<ts.Node>;
  relayed: Map<ts.ParameterDeclaration, ReadonlySet<string>>;
  watched: Map<ts.Node, boolean>;
  pruned: Map<ts.ParameterDeclaration, ReadonlySet<string>>;
};

export function laterOf(library: Library): Later {
  return { library, relied: new Set(), relayed: new Map(), watched: new Map(), pruned: new Map() };
}

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

function propertiesThatRunLater(
  later: Later,
  parameter: ts.ParameterDeclaration,
): ReadonlySet<string> {
  const known = later.pruned.get(parameter);
  if (known !== undefined) return known;
  const names = new Set<string>();
  later.pruned.set(parameter, names);
  for (const declarations of propertiesOfType(later.library.compiled, parameter.name)) {
    const watched =
      declarations.length > 0 &&
      declarations.every(
        (declaration) =>
          ts.isPropertySignatureDeclaration(declaration) && isWatched(later, declaration),
      );
    if (!watched) continue;
    for (const declaration of declarations) later.relied.add(declaration);
    names.add(nameOf(declarations[0]));
  }
  return names;
}

type RunsNow = { pruned: ReadonlySet<string> };

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
  const pruned = propertiesThatRunLater(later, parameter);
  if (pruned.size > 0) later.relayed.set(parameter, pruned);
  return { pruned };
}

function runsLaterWhereItIs(later: Later, node: ts.Node): boolean {
  return argumentPosition(later, node) === "later";
}

export function runsNowWhereItIs(later: Later, node: ts.Node): RunsNow | undefined {
  const position = argumentPosition(later, node);
  return position === "later" ? undefined : position;
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

const namedNodes = new WeakMap<
  Library["compiled"],
  WeakMap<ts.SourceFile, Map<string, ts.Node[]>>
>();

function namedNodesIn(library: Library, source: ts.SourceFile): Map<string, ts.Node[]> {
  const ofProgram = namedNodes.get(library.compiled) ?? new WeakMap();
  namedNodes.set(library.compiled, ofProgram);
  const known = ofProgram.get(source);
  if (known !== undefined) return known;
  const found = new Map<string, ts.Node[]>();
  const add = (name: string, node: ts.Node): void => {
    found.set(name, [...(found.get(name) ?? []), node]);
  };
  const look = (node: ts.Node): void => {
    if (ts.isIdentifier(node)) add(node.text, node);
    if (ts.isElementAccessExpression(node)) {
      for (const name of stringsIn(library.compiled, node.argumentExpression)) add(name, node);
    }
    node.forEachChild(look);
  };
  look(source);
  ofProgram.set(source, found);
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
    .flatMap((source) => namedNodesIn(later.library, source).get(name) ?? [])
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
  const binding = node.parent;
  if (
    binding !== undefined &&
    ts.isBindingElement(binding) &&
    ts.isObjectBindingPattern(binding.parent) &&
    (binding.propertyName ?? binding.name) === node &&
    binding.name !== undefined &&
    ts.isIdentifier(binding.name) &&
    binding.initializer === undefined
  ) {
    const uses = referencesTo(later, binding);
    return uses.length > 0 && uses.every((use) => isOnlyHandedOn(later, use, owner, followed));
  }
  const nested = enclosingFunction(node);
  return nested !== undefined && nested !== owner && isOnlyHandedOn(later, nested, owner, followed);
}

function isOnlyRelayed(later: Later, use: ts.Node, names: ReadonlySet<string>): boolean {
  const at = passedOnFrom(use);
  if (isTestedForPresence(at)) return true;
  const parent = at.parent;
  if (parent !== undefined && ts.isPropertyAccessExpression(parent) && parent.expression === at) {
    return true;
  }
  if (parent !== undefined && ts.isElementAccessExpression(parent) && parent.expression === at) {
    return stringsIn(later.library.compiled, parent.argumentExpression).length > 0;
  }
  if (
    parent !== undefined &&
    ts.isVariableDeclaration(parent) &&
    parent.initializer === at &&
    ts.isObjectBindingPattern(parent.name)
  ) {
    return !parent.name.elements.some((element) => element.dotDotDotToken !== undefined);
  }
  const position = argumentPosition(later, at);
  return (
    position !== undefined &&
    position !== "later" &&
    [...names].every((name) => position.pruned.has(name))
  );
}

const valueKeywords: readonly ts.SyntaxKind[] = [
  ts.SyntaxKind.StringKeyword,
  ts.SyntaxKind.NumberKeyword,
  ts.SyntaxKind.BooleanKeyword,
  ts.SyntaxKind.BigIntKeyword,
  ts.SyntaxKind.SymbolKeyword,
];

function mayHoldAnObject(type: ts.TypeNode | undefined): boolean {
  return type !== undefined && !valueKeywords.includes(type.kind) && !ts.isFunctionTypeNode(type);
}

function watchIn(later: Later): void {
  for (const { source } of later.library.modules) {
    const look = (node: ts.Node): void => {
      if (isWatched(later, node)) later.relied.add(node);
      else if (
        ts.isParameterDeclaration(node) &&
        mayHoldAnObject(node.type) &&
        isFunctionNode(node.parent) &&
        node.parent.body !== undefined
      ) {
        const pruned = propertiesThatRunLater(later, node);
        if (pruned.size > 0) later.relayed.set(node, pruned);
      }
      node.forEachChild(look);
    };
    look(source);
  }
}

export function listenersRunAtOnce(later: Later): string[] {
  watchIn(later);
  const checked = new Set<ts.Node>();
  const findings = new Set<string>();
  for (;;) {
    const watched = [...later.relied].filter((declaration) => !checked.has(declaration));
    const relayed = [...later.relayed].filter(([parameter]) => !checked.has(parameter));
    if (watched.length === 0 && relayed.length === 0) break;
    for (const declaration of watched) {
      checked.add(declaration);
      const owner = ts.isParameterDeclaration(declaration) ? declaration.parent : undefined;
      for (const use of referencesTo(later, declaration)) {
        if (isOnlyHandedOn(later, use, owner, new Set())) continue;
        findings.add(
          `${located(use)}: ${use.parent.getText()}: a parameter or property typed Listener or ObserverReport is used here other than tested for presence, handed on to a Listener or ObserverReport parameter of a function with a body in source, handed on to addEventListener or removeEventListener, or used in a function only handed on so. The layout-reads walk does not enter a function given to such a parameter or property, so nothing may run that function as a primitive goes live.`,
        );
      }
    }
    for (const [parameter, names] of relayed) {
      checked.add(parameter);
      for (const use of referencesTo(later, parameter)) {
        if (isOnlyRelayed(later, use, names)) continue;
        findings.add(
          `${located(use)}: ${use.parent.getText()}: a parameter whose type declares ${[...names].join(", ")} as Listener or ObserverReport is used here other than tested for presence, read by a property, destructured, or handed whole to a parameter whose type declares the same properties so. The layout-reads walk does not enter a function given to those properties, so the object must not reach a function that may run them as a primitive goes live.`,
        );
      }
    }
  }
  return [...findings];
}
