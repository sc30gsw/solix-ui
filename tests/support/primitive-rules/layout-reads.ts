import { basename } from "node:path";
import {
  calledDeclaration,
  declarationsOf,
  fileOf,
  memberDeclarations,
  nameOf,
  stringsIn,
  ts,
  unwrapped,
} from "#/scripts/syntax.ts";
import type { Home } from "#/tests/support/workspace.ts";
import {
  enclosingFunction,
  type FunctionNode,
  functionsACallRuns,
  functionsItMayBe,
  holderLiterals,
  initializerOf,
  inSource,
  isAssignedTo,
  isFunctionNode,
  membersNamed,
  outermost,
  resolution,
} from "#/tests/support/primitive-rules/held-functions.ts";
import {
  calleeName,
  type Declared,
  exportedFunctions,
  isDeclared,
  isDefaultLibraryDeclarationNamed,
  isInHome,
  type Library,
  located,
  type PrimitiveRule,
  publicModules,
  refersToDomMember,
} from "#/tests/support/primitive-rules/library.ts";
import {
  type Later,
  laterOf,
  listenersRunAtOnce,
  runsNowWhereItIs,
} from "#/tests/support/primitive-rules/runs-later.ts";

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
      "it runs on the next task after the trap turns on and reads the layout once, to pick the element it focuses and to decide whether that element lies outside the viewport, as the browser's own focus does; it keeps neither answer, and a later move of focus reads the layout again. The trap's own focus listeners, which its focus move runs, read the layout only to bring focus back, as they do at any later move",
  },
];

const listenerRegistrars: readonly Declared[] = ["watchEvents", "handleEvent", "listenAsAsked"].map(
  (name) => ({ file: "internal-listener.ts", name }),
);
const registrarsOfSettings = ["listenAsAsked"];
const focusMover: Declared = { file: "internal-focus.ts", name: "moveFocus" };
const focusMoveEvents: readonly string[] = ["focus", "blur", "focusin", "focusout"];
const dispatchers = ["dispatchEvent"];

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
    reader.some((declaration) =>
      isDefaultLibraryDeclarationNamed(declaration, descriptorReaders),
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

type Walk = {
  library: Library;
  later: Later;
  exemptions: readonly LayoutReadExemption[];
  reads: Set<ts.Node>;
  readsOfExemptions: Map<LayoutReadExemption, Set<ts.Node>>;
  visited: Map<FunctionNode, Set<LayoutReadExemption | undefined>>;
  movesFocus: Map<FunctionNode, boolean>;
};

function runFunction(walk: Walk, fn: FunctionNode, under: LayoutReadExemption | undefined): void {
  const exemption = under ?? exemptionOf(fn, walk.exemptions);
  const ran = walk.visited.get(fn) ?? new Set();
  if (ran.has(exemption)) return;
  walk.visited.set(fn, ran.add(exemption));
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
  const holders = holderLiterals(resolution(walk.library), spread) ?? [];
  return gettersOf(holders.flatMap((literal) => [...literal.properties]));
}

function gettersDestructuredBy(walk: Walk, binding: ts.Node): FunctionNode[] {
  if (!ts.isBindingElement(binding) || !ts.isObjectBindingPattern(binding.parent)) return [];
  const key: ts.Node | undefined = binding.propertyName ?? binding.name;
  const name = key !== undefined && ts.isIdentifier(key) ? key.text : undefined;
  const source = initializerOf(binding.parent.parent);
  if (name === undefined || source === undefined) return [];
  const holders = holderLiterals(resolution(walk.library), source) ?? [];
  return gettersOf(membersNamed(holders, [name]));
}

type Registration = { types: readonly string[] | undefined; listener: ts.Expression };

function typesOf(library: Library, argument: ts.Expression | undefined): string[] | undefined {
  if (argument === undefined) return undefined;
  const value = unwrapped(argument);
  if (!ts.isArrayLiteralExpression(value)) {
    const types = stringsIn(library.compiled, value);
    return types.length > 0 ? types : undefined;
  }
  const types = value.elements.map((element) =>
    ts.isSpreadElement(element) ? [] : stringsIn(library.compiled, element),
  );
  return types.every((type) => type.length > 0) ? types.flat() : undefined;
}

function registrationOf(library: Library, call: ts.CallExpression): Registration | undefined {
  const called = calledDeclaration(library.compiled, call);
  const registrar =
    called === undefined
      ? undefined
      : listenerRegistrars.find((declared) => isDeclared(called, declared));
  const listener = call.arguments[2];
  if (registrar === undefined || listener === undefined) return undefined;
  if (registrarsOfSettings.includes(registrar.name)) return { types: undefined, listener };
  return { types: typesOf(library, call.arguments[1]), listener };
}

function registrationsIn(walk: Walk, fn: FunctionNode): Registration[] {
  const found: Registration[] = [];
  const look = (node: ts.Node): void => {
    if (isFunctionNode(node) && !runsWhereItStands(walk.later, node)) return;
    if (ts.isCallExpression(node)) {
      const registration = registrationOf(walk.library, node);
      if (registration !== undefined) found.push(registration);
    }
    node.forEachChild(look);
  };
  if (fn.body !== undefined) look(fn.body);
  return found;
}

function enclosingFunctionsOf(node: ts.Node): FunctionNode[] {
  const fn = enclosingFunction(node);
  return fn === undefined ? [] : [fn, ...enclosingFunctionsOf(fn)];
}

function runListenersFor(
  walk: Walk,
  call: ts.CallExpression,
  types: readonly string[] | undefined,
  under: LayoutReadExemption | undefined,
): void {
  for (const fn of enclosingFunctionsOf(call)) {
    for (const registration of registrationsIn(walk, fn)) {
      const heard =
        types === undefined ||
        registration.types === undefined ||
        registration.types.some((type) => types.includes(type));
      if (heard) {
        runEach(walk, functionsItMayBe(resolution(walk.library), registration.listener), under);
      }
    }
  }
}

function dispatchedTypes(library: Library, call: ts.CallExpression): string[] | undefined {
  const event = call.arguments[0] && unwrapped(call.arguments[0]);
  if (event === undefined || !ts.isNewExpression(event)) return undefined;
  const types = stringsIn(library.compiled, event.arguments?.[0]);
  return types.length > 0 ? types : undefined;
}

function isADispatch(library: Library, call: ts.CallExpression): boolean {
  return refersToDomMember(library, unwrapped(call.expression), (declaration) =>
    dispatchers.includes(nameOf(declaration)),
  );
}

function movesFocus(walk: Walk, fn: FunctionNode): boolean {
  const known = walk.movesFocus.get(fn);
  if (known !== undefined) return known;
  walk.movesFocus.set(fn, false);
  if (isDeclared(fn, focusMover)) {
    walk.movesFocus.set(fn, true);
    return true;
  }
  let found = false;
  const look = (node: ts.Node): void => {
    if (found || (isFunctionNode(node) && !runsWhereItStands(walk.later, node))) return;
    if (
      ts.isCallExpression(node) &&
      functionsACallRuns(resolution(walk.library), node).some((called) => movesFocus(walk, called))
    ) {
      found = true;
      return;
    }
    node.forEachChild(look);
  };
  if (fn.body !== undefined) look(fn.body);
  walk.movesFocus.set(fn, found);
  return found;
}

function runListenersACallRuns(
  walk: Walk,
  call: ts.CallExpression,
  called: readonly FunctionNode[],
  under: LayoutReadExemption | undefined,
): void {
  if (isADispatch(walk.library, call)) {
    runListenersFor(walk, call, dispatchedTypes(walk.library, call), under);
  }
  for (const fn of called) {
    if (movesFocus(walk, fn)) {
      runListenersFor(walk, call, focusMoveEvents, under ?? exemptionOf(fn, walk.exemptions));
    }
  }
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
    const called = functionsACallRuns(resolution(walk.library), node);
    runEach(walk, called, under);
    runListenersACallRuns(walk, node, called, under);
  }
  if (ts.isTaggedTemplateExpression(node)) {
    runEach(walk, functionsItMayBe(resolution(walk.library), node.tag), under);
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
    runEach(walk, functionsItMayBe(resolution(walk.library, position.pruned), node), under);
  }
  node.forEachChild((child) => visit(walk, child, under));
}

function withoutFollowers(reads: Iterable<ts.Node>): ts.Node[] {
  return [...reads].filter((node) => !followers.some((home) => isInHome(node, home)));
}

export function layoutReadsRuleWith(exemptions: readonly LayoutReadExemption[]): PrimitiveRule {
  return {
    description: `what a public function runs as it goes live reads no layout member (${layoutMembers.join(", ")}) outside a listener or an observer callback, but in a module that follows the value it reads (${followers.map(({ file }) => file).join(", ")}) or in a function an exemption names with its reason`,
    rule: (library) => {
      const later = laterOf(library);
      const walk: Walk = {
        library,
        later,
        exemptions,
        reads: new Set(),
        readsOfExemptions: new Map(),
        visited: new Map(),
        movesFocus: new Map(),
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
