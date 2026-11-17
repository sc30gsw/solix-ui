import { commentsIn, exportsOf, type ts } from "#/scripts/syntax.ts";
import {
  at,
  exportedFunction,
  functionNameFor,
  type Module,
  type PrimitiveRule,
  publicModules,
  type Rule,
  typesModule,
} from "#/tests/support/primitive-rules/library.ts";

const docCommentStart = "/**";

function hasADocComment(module: Module, fn: ts.Node): boolean {
  const start = fn.getStart();
  return commentsIn(module.source).some(
    ({ end, text }) =>
      text.startsWith(docCommentStart) && module.source.text.slice(end, start).trim() === "",
  );
}

const publicExports: Rule = (library) => [
  ...publicModules(library).flatMap((module) => {
    const expected = functionNameFor(module.file);
    const { functions, others } = exportsOf(module.source);
    return functions.join() === expected && others.length === 0
      ? []
      : [
          `${at(module)}: export exactly one function, ${expected}, named for the file, and types (found: ${[...functions, ...others].join(", ") || "nothing"}). Give a second function its own file, or name the file internal-<topic>.ts if no consumer should import it.`,
        ];
  }),
  ...publicModules(library).flatMap((module) => {
    const fn = exportedFunction(module);
    return !fn || hasADocComment(module, fn)
      ? []
      : [
          `${at(module, fn)}: write a doc comment directly above ${functionNameFor(module.file)}, above its first overload if it has any, since a consumer reads it where they call the function.`,
        ];
  }),
  ...library.modules
    .filter(({ file }) => file === typesModule)
    .flatMap((module) => {
      const { functions, others } = exportsOf(module.source);
      return [...functions, ...others].map(
        (name) => `${at(module)}: export only types from ${typesModule}, not ${name}.`,
      );
    }),
];

export const publicExportsRule: PrimitiveRule = {
  description:
    "every public module exports one function, named for the file, with a doc comment directly above it, and its types, and types.ts exports only types",
  rule: publicExports,
};
