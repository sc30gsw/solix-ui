import { basename, join } from "node:path";
import {
  calledDeclaration,
  contextualAliases,
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
import { type Home, repositoryRoot } from "#/tests/support/workspace.ts";
import {
  calleeName,
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

const runsLaterRoles = ["Listener", "ObserverReport"];
const primitivesSource = join(repositoryRoot, "packages/primitives/src");
const theFunctionWithAnotherThis = ["call", "apply"];
const bound = "bind";

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

function isAnArgument(node: ts.Node): boolean {
  const call = node.parent;
  return (
    call !== undefined &&
    (ts.isCallExpression(call) || ts.isNewExpression(call)) &&
    (call.arguments ?? []).some((argument) => argument === node)
  );
}

function runsLater(library: Library, argument: ts.Node): boolean {
  return contextualAliases(library.compiled, argument).some(
    (alias) => runsLaterRoles.includes(alias.name) && alias.file.startsWith(primitivesSource),
  );
}

function isPassedToRunNow(library: Library, node: ts.Node): boolean {
  const outer = outermost(node);
  return isAnArgument(outer) && !runsLater(library, outer);
}

function runsWhereItStands(library: Library, fn: ts.Node): boolean {
  const outer = outermost(fn);
  const parent = outer.parent;
  if (parent === undefined) return false;
  if (ts.isCallExpression(parent) && parent.expression === outer) return true;
  if (ts.isParameterDeclaration(parent) && parent.initializer === outer) return true;
  return isPassedToRunNow(library, fn);
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

class Resolver {
  readonly library: Library;
  readonly seen = new Set<ts.Node>();

  constructor(library: Library) {
    this.library = library;
  }

  functionsItMayBe(expression: ts.Node): FunctionNode[] {
    const value = ts.isExpression(expression) ? unwrapped(expression) : expression;
    if (this.seen.has(value)) return [];
    this.seen.add(value);
    if (isFunctionNode(value)) return value.body && inSource(value) ? [value] : [];
    if (ts.isConditionalExpression(value)) {
      return [...this.functionsItMayBe(value.whenTrue), ...this.functionsItMayBe(value.whenFalse)];
    }
    if (ts.isBinaryExpression(value)) {
      return value.operatorToken.kind === ts.SyntaxKind.CommaToken
        ? this.functionsItMayBe(value.right)
        : [...this.functionsItMayBe(value.left), ...this.functionsItMayBe(value.right)];
    }
    if (ts.isCallExpression(value)) {
      if (this.isBound(value)) return this.functionsItMayBe(this.calleeOf(value));
      return this.functionsACallRuns(value).flatMap((fn) =>
        returnedValuesOf(fn).flatMap((returned) => this.functionsItMayBe(returned)),
      );
    }
    if (ts.isArrayLiteralExpression(value)) {
      return value.elements.flatMap((element) => this.functionsItMayBe(element));
    }
    if (ts.isObjectLiteralExpression(value)) {
      return value.properties.flatMap((property) =>
        ts.isPropertyAssignment(property) ? this.functionsItMayBe(property.initializer) : [],
      );
    }
    if (ts.isElementAccessExpression(value)) {
      const named = this.functionsHeldBy(memberDeclarations(this.library.compiled, value));
      return named.length > 0 ? named : this.functionsItMayBe(value.expression);
    }
    return this.functionsHeldBy(memberDeclarations(this.library.compiled, value));
  }

  functionsHeldBy(declarations: readonly ts.Node[]): FunctionNode[] {
    return declarations.flatMap((declaration) => {
      if (!inSource(declaration)) return [];
      if (isFunctionNode(declaration)) return declaration.body ? [declaration] : [];
      if (ts.isBindingElement(declaration)) {
        return this.functionsHeldBy(memberDeclarations(this.library.compiled, declaration));
      }
      if (
        ts.isVariableDeclaration(declaration) ||
        ts.isPropertyDeclaration(declaration) ||
        ts.isPropertyAssignment(declaration) ||
        ts.isParameterDeclaration(declaration)
      ) {
        return declaration.initializer ? this.functionsItMayBe(declaration.initializer) : [];
      }
      return [];
    });
  }

  isBound(call: ts.CallExpression): boolean {
    const callee = unwrapped(call.expression);
    return ts.isPropertyAccessExpression(callee) && callee.name.text === bound;
  }

  calleeOf(call: ts.CallExpression): ts.Expression {
    const callee = unwrapped(call.expression);
    return ts.isPropertyAccessExpression(callee) &&
      [...theFunctionWithAnotherThis, bound].includes(callee.name.text)
      ? callee.expression
      : callee;
  }

  functionsACallRuns(call: ts.CallExpression): FunctionNode[] {
    if (this.isBound(call)) return [];
    const resolved = calledDeclaration(this.library.compiled, call);
    return [
      ...(resolved ? this.functionsHeldBy([resolved]) : []),
      ...this.functionsItMayBe(this.calleeOf(call)),
    ];
  }
}

type Walk = {
  library: Library;
  exemptions: readonly LayoutReadExemption[];
  reads: Set<ts.Node>;
  readsOfExemptions: Map<LayoutReadExemption, Set<ts.Node>>;
  visited: Set<string>;
};

function resolve(walk: Walk): Resolver {
  return new Resolver(walk.library);
}

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

function createInstancesOf(
  walk: Walk,
  created: ts.Expression,
  under: LayoutReadExemption | undefined,
): void {
  for (const declaration of memberDeclarations(walk.library.compiled, unwrapped(created))) {
    if (!ts.isClassLikeDeclaration(declaration) || !inSource(declaration)) continue;
    for (const member of declaration.members) {
      if (ts.isConstructorDeclaration(member)) runFunction(walk, member, under);
      else if (ts.isPropertyDeclaration(member) && member.initializer) {
        visit(walk, member.initializer, under);
      } else if (ts.isClassStaticBlockDeclaration(member)) visit(walk, member, under);
    }
  }
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

function accessorsRunBy(walk: Walk, node: ts.Node): FunctionNode[] {
  const wanted = isAssignedTo(node) ? ts.isSetAccessorDeclaration : ts.isGetAccessorDeclaration;
  return memberDeclarations(walk.library.compiled, node).filter(
    (declaration): declaration is FunctionNode =>
      wanted(declaration) && inSource(declaration) && declaration.body !== undefined,
  );
}

function visit(walk: Walk, node: ts.Node, under: LayoutReadExemption | undefined): void {
  if (isFunctionNode(node)) {
    if (runsWhereItStands(walk.library, node)) runFunction(walk, node, under);
    return;
  }
  if (ts.isClassLikeDeclaration(node)) return;
  if (readsLayout(walk.library, node)) {
    const bucket = under ? walk.readsOfExemptions.get(under) : walk.reads;
    bucket?.add(node);
  }
  if (ts.isCallExpression(node)) runEach(walk, resolve(walk).functionsACallRuns(node), under);
  if (ts.isTaggedTemplateExpression(node)) {
    runEach(walk, resolve(walk).functionsItMayBe(node.tag), under);
  }
  if (ts.isNewExpression(node)) createInstancesOf(walk, node.expression, under);
  if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {
    runEach(walk, accessorsRunBy(walk, node), under);
  }
  if (!isFunctionNode(node) && ts.isExpression(node) && isPassedToRunNow(walk.library, node)) {
    runEach(walk, resolve(walk).functionsItMayBe(node), under);
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
      return [...unexempted, ...unused];
    },
  };
}

export const layoutReadsRule: PrimitiveRule = layoutReadsRuleWith(layoutReadExemptions);
