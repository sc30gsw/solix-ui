import { nameOf, reachedFrom, ts } from "#/scripts/syntax.ts";
import type { Home } from "#/tests/support/workspace.ts";
import {
  callsTo,
  type Declared,
  exportedFunctions,
  isInHome,
  type Library,
  located,
  type PrimitiveRule,
  publicModules,
  refersToDomMember,
  type Rule,
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
  "getComputedStyle",
  "checkVisibility",
]);

const followersOfTheWindowsPosition: readonly Home[] = [
  { file: "internal-scroll.ts" },
  { file: "create-window-scroll.ts" },
];

export type LayoutReadExemption = Required<Home> & { reason: string };

export const layoutReadExemptions: readonly LayoutReadExemption[] = [
  {
    file: "create-focus-trap.ts",
    fn: "focusInitially",
    reason:
      "it decides once, as it moves focus, whether the element it focused lies outside the viewport, as the browser's own focus does; a later change of layout is not a focus move",
  },
  {
    file: "internal-tabbable.ts",
    fn: "isFocusable",
    reason:
      "the trap reads which elements show each time it moves focus, and keeps no answer; a stylesheet that later hides the element it focused leaves the trap as removing that element does, and the next focus move reads again",
  },
];

const callbacksRunLater: readonly (Declared & { argument: number })[] = [
  { file: "internal-listener.ts", name: "watchEvents", argument: 2 },
  { file: "internal-listener.ts", name: "handleEvent", argument: 2 },
  { file: "internal-listener.ts", name: "listenAsAsked", argument: 2 },
  { file: "internal-dom-observer.ts", name: "observe", argument: 3 },
];

function isAListenerOrObserverCallback(library: Library, node: ts.Node): boolean {
  const call = node.parent;
  if (!ts.isCallExpression(call)) return false;
  const position = call.arguments.findIndex((argument) => argument === node);
  return callbacksRunLater.some(
    (callee) => callee.argument === position && callsTo(library, call, callee),
  );
}

export function readsLayout(library: Library, node: ts.Node): boolean {
  return refersToDomMember(library, node, (declaration) =>
    layoutMembers.includes(nameOf(declaration)),
  );
}

const layoutReads: Rule = (library) => {
  const roots = publicModules(library).flatMap((module) => exportedFunctions(module).all);
  const reached = reachedFrom(library.compiled, roots, (node) =>
    isAListenerOrObserverCallback(library, node),
  ).nodes;
  const reads = [...new Set(reached)]
    .filter((node) => readsLayout(library, node))
    .filter((node) => !followersOfTheWindowsPosition.some((home) => isInHome(node, home)));
  const unexempted = reads
    .filter((node) => !layoutReadExemptions.some((exemption) => isInHome(node, exemption)))
    .map(
      (node) =>
        `${located(node)}: ${node.getText()}: a public primitive reads layout here as it goes live, and keeps what it read when a stylesheet or a resize changes the layout later. Read it inside a listener or an observer callback, follow the window's position through internal-scroll.ts, or add an exemption with its reason to layoutReadExemptions.`,
    );
  const unused = layoutReadExemptions
    .filter((exemption) => library.modules.some(({ file }) => file === exemption.file))
    .filter((exemption) => !reads.some((node) => isInHome(node, exemption)))
    .map(
      ({ file, fn }) =>
        `${file}: ${fn} reads no layout as a primitive goes live, so drop its entry from layoutReadExemptions.`,
    );
  return [...unexempted, ...unused];
};

export const layoutReadsRule: PrimitiveRule = {
  description: `what a public function runs as it goes live, through every function it reaches outside a listener or an observer callback, reads no layout member (${layoutMembers.join(", ")}) but in internal-scroll.ts, create-window-scroll.ts or an exemption that gives its reason`,
  rule: layoutReads,
};
