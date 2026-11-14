import ts from "typescript";
import { descendants, importsOf } from "../syntax";
import { at, type PrimitiveRule, type Rule } from "./library";

const listenerModule = "internal-listener.ts";
const takesAConsumersOptions = [
  "create-event-listener.ts",
  "create-click-outside.ts",
  "internal-attachment.ts",
];
const rawListen = "listen";
const domMethods = ["addEventListener", "removeEventListener"];

const listenerRoles: Rule = (library) =>
  library.modules
    .filter(({ file }) => file !== listenerModule)
    .flatMap((module) => [
      ...(takesAConsumersOptions.includes(module.file)
        ? []
        : importsOf(module.source)
            .flatMap(({ names }) => names)
            .filter(({ imported }) => imported === rawListen)
            .map(
              ({ node }) =>
                `${at(module, node)}: ${rawListen}: add a listener through watchEvents, in the capture phase, when the primitive reads state, or through handleEvent, on window after Solid's delegated handlers, when it acts. Only a listener whose options a consumer gives calls ${rawListen}.`,
            )),
      ...descendants(module.source)
        .filter(
          (node): node is ts.CallExpression =>
            ts.isCallExpression(node) &&
            ts.isPropertyAccessExpression(node.expression) &&
            domMethods.includes(node.expression.name.text),
        )
        .map(
          (node) =>
            `${at(module, node)}: ${node.getText().split("\n")[0]}: add and remove listeners through ${listenerModule}, so each one is removed with the capture it was added with.`,
        ),
    ]);

export const listenerRolesRule: PrimitiveRule = {
  description:
    "a primitive listens through watchEvents or handleEvent, only a listener with a consumer's options calls listen, and only internal-listener.ts calls addEventListener",
  rule: listenerRoles,
};
