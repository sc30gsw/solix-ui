import ts from "typescript";
import { browserOnlyGlobals } from "../../../packages/primitives/tests/support/browser-resources";
import { descendants, isCallTo, isInTypePosition } from "../syntax";
import {
  at,
  isGlobal,
  type Library,
  type Module,
  type PrimitiveRule,
  publicModules,
  type Rule,
} from "./library";

const browserOnly: readonly string[] = browserOnlyGlobals;
const stateCommand = "createStateCommand";

const browserOnlyArguments: Record<string, number[]> = {
  createBrowserValue: [0],
  createScrollFold: [0, 1],
  readOn: [0, 2],
  createAttachment: [1],
  createElementAttachment: [1],
  createElementValue: [1],
  createTargetListener: [0, 2],
  createWindowHandler: [1],
  createBrowserCommand: [0],
  createClientMemo: [0],
  createEffect: [1],
};

function calledName(call: ts.CallExpression): string {
  return ts.isIdentifier(call.expression) ? call.expression.text : "";
}

function browserOnlyFunctions(module: Module): Set<ts.Node> {
  return new Set(
    descendants(module.source).flatMap((node) => {
      if (!ts.isCallExpression(node)) return [];
      const positions = browserOnlyArguments[calledName(node)] ?? [];
      return positions.flatMap((position) => {
        const argument = node.arguments[position];
        return argument && (ts.isArrowFunction(argument) || ts.isFunctionExpression(argument))
          ? [argument]
          : [];
      });
    }),
  );
}

function insideOneOf(node: ts.Node, functions: ReadonlySet<ts.Node>): boolean {
  return ts.findAncestor(node, (ancestor) => functions.has(ancestor)) !== undefined;
}

function moduleFunctionsUsedOnlyIn(
  library: Library,
  module: Module,
  allowed: Set<ts.Node>,
): Set<ts.Node> {
  const declared = module.source.statements.filter(ts.isFunctionDeclaration);
  const references = (fn: ts.FunctionDeclaration) => {
    const symbol = fn.name && library.checker.getSymbolAtLocation(fn.name);
    return descendants(module.source).filter(
      (node) =>
        ts.isIdentifier(node) &&
        node !== fn.name &&
        symbol !== undefined &&
        library.checker.getSymbolAtLocation(node) === symbol,
    );
  };
  const grows = { again: true };
  while (grows.again) {
    grows.again = false;
    for (const fn of declared) {
      if (allowed.has(fn)) continue;
      const used = references(fn);
      if (used.length > 0 && used.every((node) => insideOneOf(node, allowed))) {
        allowed.add(fn);
        grows.again = true;
      }
    }
  }
  return allowed;
}

function isBrowserGlobalRead(library: Library, node: ts.Node): node is ts.Identifier {
  return (
    ts.isIdentifier(node) &&
    browserOnly.includes(node.text) &&
    !isInTypePosition(node) &&
    isGlobal(library, node)
  );
}

export function stateCommandBodies(module: Module): Set<ts.Node> {
  return new Set(
    descendants(module.source).flatMap((node) =>
      isCallTo(node, stateCommand) && node.arguments[0] ? [node.arguments[0]] : [],
    ),
  );
}

export function browserGlobalReadsReachedFrom(
  library: Library,
  module: Module,
  root: ts.Node,
): ts.Identifier[] {
  const reached = new Set<ts.Node>([root]);
  const queue: ts.Node[] = [root];
  while (queue.length > 0) {
    const at = queue.pop();
    if (!at) continue;
    for (const node of descendants(at)) {
      if (!ts.isIdentifier(node)) continue;
      const declaration = library.checker.getSymbolAtLocation(node)?.valueDeclaration;
      if (
        declaration &&
        ts.isFunctionDeclaration(declaration) &&
        declaration.getSourceFile() === module.source &&
        !reached.has(declaration)
      ) {
        reached.add(declaration);
        queue.push(declaration);
      }
    }
  }
  return [...reached].flatMap((node) =>
    descendants(node).filter((found) => isBrowserGlobalRead(library, found)),
  );
}

const browserGlobalReads: Rule = (library) =>
  publicModules(library).flatMap((module) => {
    const reportedAsCommands = new Set([
      ...browserOnlyFunctions(module),
      ...stateCommandBodies(module),
    ]);
    const allowed = moduleFunctionsUsedOnlyIn(library, module, reportedAsCommands);
    return descendants(module.source)
      .filter(
        (node): node is ts.Identifier =>
          isBrowserGlobalRead(library, node) && !insideOneOf(node, allowed),
      )
      .map(
        (node) =>
          `${at(module, node)}: ${node.text}: read a browser-only global only inside a browser-value subscription, an attachment's attach function, a browser command or an effect's apply, which the server never runs.`,
      );
  });

export const browserGlobalReadsRule: PrimitiveRule = {
  description:
    "a public module reads a browser-only global only inside a browser-value subscription, an attach function, a browser command or an effect's apply",
  rule: browserGlobalReads,
};
