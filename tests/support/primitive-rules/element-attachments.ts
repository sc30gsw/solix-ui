import {
  declarationsOf,
  descendants,
  isInTypePosition,
  returnsAlias,
  ts,
} from "#/scripts/syntax.ts";
import {
  at,
  exportedFunctions,
  isFromSolid,
  type PrimitiveRule,
  publicModules,
  reaches,
  type Rule,
} from "#/tests/support/primitive-rules/library.ts";

const attachmentHelper = { file: "internal-attachment.ts", name: "createElementAttachmentWhen" };
const refSetterType = "RefSetter";
const reactiveNodesTheHelperOwns = ["createEffect", "createMemo", "createSignal"];

const elementAttachments: Rule = (library) =>
  publicModules(library).flatMap((module) => {
    const { first: fn, all } = exportedFunctions(module);
    if (!fn || !returnsAlias(library.compiled, fn, refSetterType)) return [];
    const helper = `${attachmentHelper.name} in ${attachmentHelper.file}`;
    const missing = reaches(library, all, attachmentHelper)
      ? []
      : [
          `${at(module, fn.name)}: ${fn.name.text} returns a ${refSetterType}, alone or in a tuple or object, so build it on ${helper}, directly or through another primitive.`,
        ];
    const ownNodes = descendants(module.source)
      .filter(
        (node) =>
          ts.isIdentifier(node) &&
          !isInTypePosition(node) &&
          !ts.isImportSpecifier(node.parent) &&
          declarationsOf(library.compiled, node).some((declaration) =>
            isFromSolid(declaration, reactiveNodesTheHelperOwns),
          ),
      )
      .map(
        (node) =>
          `${at(module, node)}: ${node.getText()}: a module that returns a ${refSetterType} leaves its signal, memo and effect to ${helper}, which creates them the same way on the server and in the browser.`,
      );
    return [...missing, ...ownNodes];
  });

export const elementAttachmentsRule: PrimitiveRule = {
  description:
    "every public primitive that returns a RefSetter, alone or in a tuple or object, reaches createElementAttachmentWhen and refers to no Solid createEffect, createMemo or createSignal",
  rule: elementAttachments,
};
