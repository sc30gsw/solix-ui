export * as ts from "./syntax/tree";
export {
  openProgram,
  parse,
  parseAll,
  stringLiteralTypesOf,
  type CompilerOptions,
  type Program,
} from "./syntax/program";
export {
  commentsIn,
  descendants,
  exportsOf,
  isExported,
  isTypeOnlyImport,
  nameOf,
  type Comment,
  type Exports,
} from "./syntax/walk";
