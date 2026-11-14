export * as ts from "./syntax/tree.ts";
export {
  openProgram,
  parse,
  parseAll,
  stringLiteralTypesOf,
  type CompilerOptions,
  type Program,
} from "./syntax/program.ts";
export {
  commentsIn,
  descendants,
  exportsOf,
  isExported,
  isTypeOnlyImport,
  nameOf,
  type Comment,
  type Exports,
} from "./syntax/walk.ts";
