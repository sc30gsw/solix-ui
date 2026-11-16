export * as ts from "./syntax/ast.ts";
export {
  openProgram,
  parse,
  parseAll,
  parseText,
  parseWithoutLibrariesOrImports,
  sharedSettings,
  stringLiteralTypesOf,
  type Program,
} from "./syntax/program.ts";
export {
  commentsIn,
  descendants,
  exportsOf,
  findAncestor,
  isExported,
  isTypeOnlyImport,
  modifierFlags,
  staticPropertyName,
  type Comment,
  type Exports,
} from "./syntax/walk.ts";
