import { basename, join } from "node:path";
import {
  calledDeclaration,
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
const handsOnToTheDom = ["addEventListener", "removeEventListener"];
const callsItsTarget = ["call", "apply"];
const bindsItsTarget = "bind";

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

type CallLike = ts.CallExpression | ts.NewExpression;

function callTaking(node: ts.Node): { call: CallLike; index: number } | undefined {
  const call = node.parent;
  if (call === undefined || !(ts.isCallExpression(call) || ts.isNewExpression(call))) {
    return undefined;
  }
  const index = (call.arguments ?? []).findIndex((argument) => argument === node);
  return index === -1 ? undefined : { call, index };
}

function isARunsLaterType(library: Library, type: ts.Node | undefined): boolean {
  if (type === undefined || !ts.isTypeReferenceNode(type)) return false;
  return declarationsOf(library.compiled, type.typeName).some(
    (declaration) =>
      ts.isTypeAliasDeclaration(declaration) &&
      runsLaterTypes.some(
        ({ file, name }) => fileOf(declaration) === file && nameOf(declaration) === name,
      ),
  );
}

function parameterTaking(library: Library, argument: ts.Node): ts.ParameterDeclaration | undefined {
  const taken = callTaking(argument);
  if (taken === undefined) return undefined;
  const called = calledDeclaration(library.compiled, taken.call);
  const parameters = (called as FunctionNode | undefined)?.parameters;
  return parameters?.[taken.index];
}

function runsLater(library: Library, argument: ts.Node): boolean {
  return isARunsLaterType(library, parameterTaking(library, argument)?.type);
}

function isAPropertyThatRunsLater(library: Library, property: ts.Node): boolean {
  return (
    ts.isPropertyAssignment(property) &&
    declarationsOf(library.compiled, property.name).some(
      (declaration) =>
        ts.isPropertySignatureDeclaration(declaration) &&
        isARunsLaterType(library, declaration.type),
    )
  );
}

function isPassedToRunNow(library: Library, node: ts.Node): boolean {
  const outer = outermost(node);
  return callTaking(outer) !== undefined && !runsLater(library, outer);
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

type Resolution = { library: Library; seen: Set<ts.Node> };

function assignmentsIn(source: ts.SourceFile): ts.BinaryExpression[] {
  const found: ts.BinaryExpression[] = [];
  const look = (node: ts.Node): void => {
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
      found.push(node);
    }
    node.forEachChild(look);
  };
  look(source);
  return found;
}

function valuesAssignedTo(resolution: Resolution, declaration: ts.Node): ts.Expression[] {
  const sources = new Set([
    declaration.getSourceFile(),
    ...resolution.library.modules.map(({ source }) => source),
  ]);
  return [...sources]
    .flatMap(assignmentsIn)
    .filter((assignment) =>
      memberDeclarations(resolution.library.compiled, assignment.left).includes(declaration),
    )
    .map((assignment) => assignment.right);
}

function functionsItMayBe(resolution: Resolution, expression: ts.Node): FunctionNode[] {
  const value = ts.isExpression(expression) ? unwrapped(expression) : expression;
  if (resolution.seen.has(value)) return [];
  resolution.seen.add(value);
  const may = (next: ts.Node) => functionsItMayBe(resolution, next);
  if (isFunctionNode(value)) return value.body && inSource(value) ? [value] : [];
  if (ts.isConditionalExpression(value)) return [...may(value.whenTrue), ...may(value.whenFalse)];
  if (ts.isBinaryExpression(value)) {
    return value.operatorToken.kind === ts.SyntaxKind.CommaToken
      ? may(value.right)
      : [...may(value.left), ...may(value.right)];
  }
  if (ts.isCallExpression(value)) {
    const target = boundFrom(resolution.library, value);
    if (target !== undefined) return may(target);
    return functionsACallRuns(resolution, value).flatMap((fn) => returnedValuesOf(fn).flatMap(may));
  }
  if (ts.isArrayLiteralExpression(value)) return value.elements.flatMap(may);
  if (ts.isObjectLiteralExpression(value)) {
    return value.properties.flatMap((property) =>
      ts.isPropertyAssignment(property) && !isAPropertyThatRunsLater(resolution.library, property)
        ? may(property.initializer)
        : [],
    );
  }
  const declarations = memberDeclarations(resolution.library.compiled, value);
  const held = functionsHeldBy(resolution, declarations);
  if (held.length > 0) return held;
  if (
    (ts.isPropertyAccessExpression(value) || ts.isElementAccessExpression(value)) &&
    declarations.every(inSource)
  ) {
    return may(value.expression);
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
  const may = (next: ts.Node) => functionsItMayBe(resolution, next);
  return declarations.flatMap((declaration) => {
    if (!inSource(declaration)) return [];
    if (isFunctionNode(declaration)) return declaration.body ? [declaration] : [];
    if (ts.isBindingElement(declaration)) {
      return functionsHeldBy(
        resolution,
        memberDeclarations(resolution.library.compiled, declaration),
      );
    }
    const iterated = iteratedBy(declaration) ?? receiverIteratedBy(declaration);
    const initializer = (declaration as { initializer?: ts.Expression }).initializer;
    return [
      ...(initializer ? may(initializer) : []),
      ...(iterated ? may(iterated) : []),
      ...valuesAssignedTo(resolution, declaration).flatMap(may),
    ];
  });
}

function functionsACallRuns(resolution: Resolution, call: ts.CallExpression): FunctionNode[] {
  if (boundFrom(resolution.library, call) !== undefined) return [];
  const resolved = calledDeclaration(resolution.library.compiled, call);
  return [
    ...(resolved ? functionsHeldBy(resolution, [resolved]) : []),
    ...functionsItMayBe(resolution, calleeOf(resolution.library, call)),
  ];
}

function resolution(library: Library): Resolution {
  return { library, seen: new Set() };
}

type Walk = {
  library: Library;
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

function objectLiteralsItMayBe(walk: Walk, expression: ts.Node): ts.ObjectLiteralExpression[] {
  const value = ts.isExpression(expression) ? unwrapped(expression) : expression;
  if (ts.isObjectLiteralExpression(value)) return [value];
  return memberDeclarations(walk.library.compiled, value).flatMap((declaration) => {
    const initializer = (declaration as { initializer?: ts.Expression }).initializer;
    return initializer &&
      inSource(declaration) &&
      ts.isObjectLiteralExpression(unwrapped(initializer))
      ? [unwrapped(initializer) as ts.ObjectLiteralExpression]
      : [];
  });
}

function gettersSpreadBy(walk: Walk, spread: ts.Expression): FunctionNode[] {
  return objectLiteralsItMayBe(walk, spread).flatMap((literal) =>
    literal.properties.flatMap((property) =>
      ts.isGetAccessorDeclaration(property) && property.body !== undefined ? [property] : [],
    ),
  );
}

function gettersDestructuredBy(walk: Walk, binding: ts.Node): FunctionNode[] {
  if (!ts.isBindingElement(binding) || !ts.isObjectBindingPattern(binding.parent)) return [];
  const key: ts.Node | undefined = binding.propertyName ?? binding.name;
  const name = key !== undefined && ts.isIdentifier(key) ? key.text : undefined;
  const holder = binding.parent.parent;
  const source = (holder as { initializer?: ts.Expression }).initializer;
  return source === undefined
    ? []
    : objectLiteralsItMayBe(walk, source).flatMap((literal) =>
        literal.properties.flatMap((property) =>
          ts.isGetAccessorDeclaration(property) &&
          property.body !== undefined &&
          nameOf(property) === name
            ? [property]
            : [],
        ),
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
  if (ts.isCallExpression(node)) {
    runEach(walk, functionsACallRuns(resolution(walk.library), node), under);
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
  if (ts.isExpression(node) && isPassedToRunNow(walk.library, node)) {
    runEach(walk, functionsItMayBe(resolution(walk.library), node), under);
  }
  node.forEachChild((child) => visit(walk, child, under));
}

function enclosingFunction(node: ts.Node): FunctionNode | undefined {
  const parent = node.parent;
  if (parent === undefined) return undefined;
  return isFunctionNode(parent) ? parent : enclosingFunction(parent);
}

function isHandedOnToTheDom(library: Library, argument: ts.Node): boolean {
  const taken = callTaking(argument);
  return (
    taken !== undefined &&
    ts.isCallExpression(taken.call) &&
    refersToDomMember(library, unwrapped(taken.call.expression), (declaration) =>
      handsOnToTheDom.includes(nameOf(declaration)),
    )
  );
}

function referencesTo(library: Library, declaration: ts.Node, within: ts.Node): ts.Node[] {
  const found: ts.Node[] = [];
  const look = (node: ts.Node): void => {
    if (
      ts.isIdentifier(node) &&
      node !== (declaration as { name?: ts.Node }).name &&
      declarationsOf(library.compiled, node).includes(declaration)
    ) {
      found.push(node);
    }
    node.forEachChild(look);
  };
  look(within);
  return found;
}

function isOnlyHandedOn(library: Library, node: ts.Node, owner: ts.Node): boolean {
  const outer = outermost(node);
  if (runsLater(library, outer) || isHandedOnToTheDom(library, outer)) return true;
  const holder = outer.parent;
  if (
    isFunctionNode(node) &&
    holder !== undefined &&
    ts.isVariableDeclaration(holder) &&
    holder.initializer === outer
  ) {
    const uses = referencesTo(library, holder, holder.getSourceFile());
    return uses.length > 0 && uses.every((use) => isOnlyHandedOn(library, use, owner));
  }
  if (isFunctionNode(node) && isReturnedAsARunsLaterValue(library, node)) return true;
  const nested = enclosingFunction(node);
  return nested !== undefined && nested !== owner && isOnlyHandedOn(library, nested, owner);
}

function isReturnedAsARunsLaterValue(library: Library, fn: FunctionNode): boolean {
  const outer = outermost(fn);
  const returning = outer.parent;
  if (returning === undefined) return false;
  const from = ts.isReturnStatement(returning) ? enclosingFunction(returning) : returning;
  return (
    from !== undefined &&
    isFunctionNode(from) &&
    returnedValuesOf(from).includes(outer as ts.Expression) &&
    isARunsLaterType(library, (from as { type?: ts.Node }).type)
  );
}

function parametersThatRunLater(library: Library): ts.ParameterDeclaration[] {
  const found: ts.ParameterDeclaration[] = [];
  for (const { source } of library.modules) {
    const look = (node: ts.Node): void => {
      if (ts.isParameterDeclaration(node) && isARunsLaterType(library, node.type)) found.push(node);
      node.forEachChild(look);
    };
    look(source);
  }
  return found;
}

function listenersRunAtOnce(library: Library): string[] {
  return parametersThatRunLater(library).flatMap((parameter) => {
    const owner = parameter.parent;
    return referencesTo(library, parameter, owner)
      .filter((use) => !isOnlyHandedOn(library, use, owner))
      .map(
        (use) =>
          `${located(use)}: ${use.parent.getText()}: a parameter typed Listener or ObserverReport is used here other than handed on to a Listener or ObserverReport parameter, to addEventListener or removeEventListener, or in a function only handed on so. The layout-reads walk does not enter a function given to such a parameter, so the parameter must not run it as a primitive goes live.`,
      );
  });
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
      return [...unexempted, ...unused, ...listenersRunAtOnce(library)];
    },
  };
}

export const layoutReadsRule: PrimitiveRule = layoutReadsRuleWith(layoutReadExemptions);
