import { importsOf } from "../syntax";
import {
  at,
  callsOneOf,
  exportedFunction,
  type PrimitiveRule,
  publicModules,
  reachesThrough,
  returnsAlias,
  type Rule,
  solidModule,
} from "./library";

const attachmentHelpers = ["createElementAttachment", "createElementValue"];
const refSetterType = "RefSetter";
const reactiveNodesTheHelperOwns = ["createEffect", "createMemo", "createSignal"];

const elementAttachments: Rule = (library) =>
  publicModules(library).flatMap((module) => {
    const fn = exportedFunction(module);
    if (!fn || !returnsAlias(library, fn, refSetterType)) return [];
    const helper = `${attachmentHelpers.join(" or ")} in internal-attachment.ts`;
    const missing = reachesThrough(library, module, (found) => callsOneOf(found, attachmentHelpers))
      ? []
      : [
          `${at(module, fn.name ?? fn)}: ${fn.name?.text ?? "it"} returns a ${refSetterType}, alone or in a tuple or object, so build it on ${helper}, directly or through another primitive.`,
        ];
    const ownNodes = importsOf(module.source)
      .filter(({ specifier }) => specifier === solidModule)
      .flatMap(({ names }) => names)
      .filter(({ imported }) => reactiveNodesTheHelperOwns.includes(imported))
      .map(
        ({ imported, node }) =>
          `${at(module, node)}: ${imported}: a module that returns a ${refSetterType} leaves its signal, memo and effect to ${helper}, which creates them the same way on the server and in the browser.`,
      );
    return [...missing, ...ownNodes];
  });

export const elementAttachmentsRule: PrimitiveRule = {
  description:
    "every public module that returns a RefSetter, alone or in a tuple or object, reaches createElementAttachment or createElementValue and imports no createEffect, createMemo or createSignal",
  rule: elementAttachments,
};
