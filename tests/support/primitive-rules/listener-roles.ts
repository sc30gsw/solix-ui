import {
  declarationsOf,
  fileOf,
  isDefaultLibraryFile,
  isDomLibraryFile,
  isValueReference,
  nameOf,
  stringsIn,
  ts,
} from "../syntax";
import { calleeName, callsTo, forbidOutside, type Library, refersTo } from "./library";

const listenerModule = "internal-listener.ts";
const rawListen = { file: listenerModule, name: "listen" };
const consumerSettings = { file: listenerModule, name: "listenerSettings" };
const domMethods = ["addEventListener", "removeEventListener"];
const eventHandlerProperty = /^on[a-z]+$/;
const eventHandlerType = /^\(\(this: [A-Za-z]+, ev: [A-Za-z]+\) => any\) \| null$/;
const writersByName = ["set", "defineProperty"];
const objectAssign = "assign";

function isDomMember(
  library: Library,
  node: ts.Node,
  matches: (declaration: ts.Declaration) => boolean,
): boolean {
  return declarationsOf(library.compiled, node).some(
    (declaration) => isDomLibraryFile(fileOf(declaration)) && matches(declaration),
  );
}

function isEventHandler(declaration: ts.Declaration): boolean {
  return (
    ts.isPropertySignature(declaration) &&
    eventHandlerProperty.test(nameOf(declaration)) &&
    eventHandlerType.test(declaration.type?.getText() ?? "")
  );
}

function memberName(node: ts.Node): ts.Node | undefined {
  if (ts.isPropertyAccessExpression(node)) return node.name;
  if (ts.isElementAccessExpression(node)) return node.argumentExpression;
  return undefined;
}

function fixesItsOwnSettings(library: Library, node: ts.Node): boolean {
  if (!callsTo(library, node, consumerSettings) || !ts.isCallExpression(node)) return false;
  const options = node.arguments[1];
  return (
    options === undefined ||
    ts.isObjectLiteralExpression(options) ||
    options.kind === ts.SyntaxKind.TrueKeyword ||
    options.kind === ts.SyntaxKind.FalseKeyword
  );
}

export const listenerRolesRule = forbidOutside({
  description: `only ${listenerModule} names listen or the DOM's addEventListener and removeEventListener, and a primitive builds listener settings only from options it was given`,
  home: { file: listenerModule },
  find: (library, node) => {
    if (isValueReference(node)) return refersTo(library, node, rawListen);
    if (fixesItsOwnSettings(library, node)) return true;
    const member = memberName(node);
    return (
      member !== undefined &&
      isDomMember(library, member, (declaration) => domMethods.includes(nameOf(declaration)))
    );
  },
  advice: `listen through ${listenerModule}: watchEvents to read state in the capture phase, handleEvent to act after Solid's delegated handlers, or listenAsAsked with settings built from the ListenerOptions a consumer gave, so each listener is removed with the capture it was added with.`,
});

function callsTheLibrary(library: Library, call: ts.CallExpression, names: string[]): boolean {
  return declarationsOf(library.compiled, calleeName(call.expression)).some(
    (declaration) =>
      isDefaultLibraryFile(fileOf(declaration)) && names.includes(nameOf(declaration)),
  );
}

function writesAHandlerByName(library: Library, node: ts.Node): boolean {
  if (!ts.isCallExpression(node)) return false;
  if (callsTheLibrary(library, node, writersByName)) {
    return stringsIn(library.compiled, node.arguments[1]).some((name) =>
      eventHandlerProperty.test(name),
    );
  }
  return (
    callsTheLibrary(library, node, [objectAssign]) &&
    node.arguments
      .slice(1)
      .some(
        (argument) =>
          ts.isObjectLiteralExpression(argument) &&
          argument.properties.some((property) =>
            eventHandlerProperty.test(property.name ? nameOf(property) : ""),
          ),
      )
  );
}

export const eventHandlerPropertiesRule = forbidOutside({
  description: "no source reads or writes an on<event> handler property of the DOM",
  find: (library, node) => {
    const member = memberName(node);
    return (
      (member !== undefined && isDomMember(library, member, isEventHandler)) ||
      writesAHandlerByName(library, node)
    );
  },
  advice: `an on<event> property holds one handler that any other code replaces, and the leak check cannot see it. Listen through ${listenerModule}.`,
});
