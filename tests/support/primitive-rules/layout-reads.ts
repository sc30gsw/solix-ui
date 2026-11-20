import { basename } from "node:path";
import {
  declarationsOf,
  fileOf,
  isDefaultLibraryFile,
  isPackageFile,
  memberDeclarations,
  nameOf,
  stringsIn,
  ts,
  unwrapped,
} from "#/scripts/syntax.ts";
import type { Home } from "#/tests/support/workspace.ts";
import {
  calleeName,
  callsTo,
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

const callbacksRunLater: readonly (Declared & { argument: number })[] = [
  { file: "internal-listener.ts", name: "watchEvents", argument: 2 },
  { file: "internal-listener.ts", name: "handleEvent", argument: 2 },
  { file: "internal-listener.ts", name: "listenAsAsked", argument: 2 },
  { file: "internal-dom-observer.ts", name: "observe", argument: 3 },
];

const callsThroughTheFunction = ["call", "apply", "bind"];

type FunctionNode = ts.Node & { body?: ts.Node };

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

function outermost(node: ts.Node): ts.Node {
  const parent = node.parent;
  return parent !== undefined && ts.isParenthesizedExpression(parent) ? outermost(parent) : node;
}

function argumentPosition(node: ts.Node): { call: ts.CallExpression; index: number } | undefined {
  const call = node.parent;
  if (call === undefined || !ts.isCallExpression(call)) return undefined;
  const index = call.arguments.findIndex((argument) => argument === node);
  return index === -1 ? undefined : { call, index };
}

function isAtACallbackPosition(library: Library, node: ts.Node): boolean {
  const position = argumentPosition(node);
  return (
    position !== undefined &&
    callbacksRunLater.some(
      (callee) => callee.argument === position.index && callsTo(library, position.call, callee),
    )
  );
}

function isCalledAtOnce(node: ts.Node): boolean {
  const outer = outermost(node);
  return outer.parent !== undefined && ts.isCallExpression(outer.parent)
    ? outer.parent.expression === outer
    : false;
}

function isPassedToRunNow(library: Library, node: ts.Node): boolean {
  const outer = outermost(node);
  return argumentPosition(outer) !== undefined && !isAtACallbackPosition(library, outer);
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

function functionsDeclaredBy(declaration: ts.Node): ts.Node[] {
  if (isPackageFile(fileOf(declaration)) || isDefaultLibraryFile(fileOf(declaration))) return [];
  if (isFunctionNode(declaration)) return declaration.body ? [declaration] : [];
  if (ts.isVariableDeclaration(declaration) || ts.isPropertyDeclaration(declaration)) {
    const initializer = declaration.initializer && unwrapped(declaration.initializer);
    return initializer && isFunctionNode(initializer) ? [initializer] : [];
  }
  if (ts.isClassLikeDeclaration(declaration)) {
    return declaration.members.filter(
      (member) =>
        ts.isConstructorDeclaration(member) ||
        ts.isPropertyDeclaration(member) ||
        ts.isClassStaticBlockDeclaration(member),
    );
  }
  return [];
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

type Walk = {
  library: Library;
  exemptions: readonly LayoutReadExemption[];
  reads: Set<ts.Node>;
  readsOfExemptions: Map<LayoutReadExemption, Set<ts.Node>>;
  visited: Set<string>;
};

function runFunction(walk: Walk, fn: ts.Node, under: LayoutReadExemption | undefined): void {
  const exemption = under ?? exemptionOf(fn, walk.exemptions);
  const key = `${fileOf(fn)}:${fn.pos}:${exemption ? `${exemption.file}#${exemption.fn}` : ""}`;
  if (walk.visited.has(key)) return;
  walk.visited.add(key);
  if (exemption && !walk.readsOfExemptions.has(exemption)) {
    walk.readsOfExemptions.set(exemption, new Set());
  }
  const body = isFunctionNode(fn) ? fn.body : fn;
  if (body) visit(walk, body, exemption);
}

function runDeclarationsOf(
  walk: Walk,
  node: ts.Node,
  under: LayoutReadExemption | undefined,
  onlyGetters = false,
): void {
  for (const declaration of memberDeclarations(walk.library.compiled, node)) {
    if (onlyGetters && !ts.isGetAccessorDeclaration(declaration)) continue;
    for (const fn of functionsDeclaredBy(declaration)) runFunction(walk, fn, under);
  }
}

function calledThrough(expression: ts.Expression): ts.Node {
  const callee = unwrapped(expression);
  return ts.isPropertyAccessExpression(callee) && callsThroughTheFunction.includes(callee.name.text)
    ? unwrapped(callee.expression)
    : callee;
}

function visit(walk: Walk, node: ts.Node, under: LayoutReadExemption | undefined): void {
  if (isFunctionNode(node)) {
    if (isCalledAtOnce(node) || isPassedToRunNow(walk.library, node)) {
      runFunction(walk, node, under);
    }
    return;
  }
  if (ts.isClassLikeDeclaration(node)) return;
  if (readsLayout(walk.library, node)) {
    const bucket = under ? walk.readsOfExemptions.get(under) : walk.reads;
    bucket?.add(node);
  }
  if (ts.isCallExpression(node)) runDeclarationsOf(walk, calledThrough(node.expression), under);
  if (ts.isNewExpression(node)) runDeclarationsOf(walk, unwrapped(node.expression), under);
  if (ts.isPropertyAccessExpression(node)) runDeclarationsOf(walk, node, under, true);
  if (
    (ts.isIdentifier(node) || ts.isPropertyAccessExpression(node)) &&
    isPassedToRunNow(walk.library, node)
  ) {
    runDeclarationsOf(walk, node, under);
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
      const walk: Walk = {
        library,
        exemptions,
        reads: new Set(),
        readsOfExemptions: new Map(),
        visited: new Set(),
      };
      for (const module of publicModules(library)) {
        for (const fn of exportedFunctions(module).all) runFunction(walk, fn, undefined);
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
      return [...unexempted, ...unused];
    },
  };
}

export const layoutReadsRule: PrimitiveRule = layoutReadsRuleWith(layoutReadExemptions);
