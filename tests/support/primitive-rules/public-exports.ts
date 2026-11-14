import { exportsOf } from "../syntax";
import {
  at,
  functionNameFor,
  type PrimitiveRule,
  publicModules,
  type Rule,
  typesModule,
} from "./library";

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
    "every public module exports one function, named for the file, and its types, and types.ts exports only types",
  rule: publicExports,
};
