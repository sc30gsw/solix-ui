import {
  declarationsOf,
  fileOf,
  isDefaultLibraryFile,
  isValueReference,
  nameOf,
  stringsIn,
  ts,
} from "#/scripts/syntax.ts";
import {
  calleeName,
  callsTo,
  forbidOutside,
  type Library,
  refersTo,
  refersToDomMember,
} from "#/tests/support/primitive-rules/library.ts";

const listenerModule = "internal-listener.ts";
const rawListen = { file: listenerModule, name: "listen" };
const consumerSettings = { file: listenerModule, name: "listenerSettings" };
const domMethods = ["addEventListener", "removeEventListener"];
const eventHandlerProperty = /^on[a-z]+$/;
const eventHandlerType = /^\(\(this: [A-Za-z]+, ev: [A-Za-z]+\) => any\) \| null$/;
const writersByName = ["set", "defineProperty"];
const objectAssign = "assign";

function isEventHandler(declaration: ts.Node): boolean {
  return (
    ts.isPropertySignatureDeclaration(declaration) &&
    eventHandlerProperty.test(nameOf(declaration)) &&
    eventHandlerType.test(declaration.type?.getText() ?? "")
  );
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
  description: `only ${listenerModule} refers to listen or to the DOM's addEventListener and removeEventListener, by any spelling refersToDomMember resolves, and outside it no call of listenerSettings leaves its options out or writes them as a literal`,
  homes: () => [{ file: listenerModule }],
  find: (library, node) => {
    if (isValueReference(node) && refersTo(library, node, rawListen)) return true;
    if (fixesItsOwnSettings(library, node)) return true;
    return refersToDomMember(library, node, (declaration) =>
      domMethods.includes(nameOf(declaration)),
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
          argument.properties.some((property) => eventHandlerProperty.test(nameOf(property))),
      )
  );
}

export const eventHandlerPropertiesRule = forbidOutside({
  description:
    "no source refers to an on<event> handler property of the DOM, by any spelling refersToDomMember resolves, or writes one by name through Reflect.set, defineProperty or Object.assign",
  find: (library, node) =>
    refersToDomMember(library, node, isEventHandler) || writesAHandlerByName(library, node),
  advice: `an on<event> property holds one handler that any other code replaces, and the leak check cannot see it. Listen through ${listenerModule}.`,
});
