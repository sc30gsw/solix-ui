import { basename, join, relative } from "node:path";
import ts from "typescript";
import { exportsOf } from "../syntax";
import { repositoryRoot } from "../workspace";
import {
  barrelModule,
  isPublic,
  type Module,
  type PrimitiveRule,
  type Rule,
  typesModule,
} from "./library";

function barrelLine(module: Module): string {
  const { functions, types } = exportsOf(module.source);
  const names = [...functions, ...types.sort().map((type) => `type ${type}`)];
  return `export { ${names.join(", ")} } from "./${basename(module.file, ".ts")}";`;
}

function barrelLinesIn(barrel: ts.SourceFile): string[] {
  return barrel.statements.map((statement) => {
    if (
      !ts.isExportDeclaration(statement) ||
      !statement.moduleSpecifier ||
      !ts.isStringLiteral(statement.moduleSpecifier) ||
      !statement.exportClause ||
      !ts.isNamedExports(statement.exportClause)
    ) {
      return statement.getText();
    }
    const names = statement.exportClause.elements.map((element) =>
      statement.isTypeOnly || element.isTypeOnly ? `type ${element.name.text}` : element.name.text,
    );
    return `export { ${names.join(", ")} } from "${statement.moduleSpecifier.text}";`;
  });
}

const barrelOrder: Rule = (library) => {
  const exported = library.modules.filter(({ file }) => isPublic(file) || file === typesModule);
  const barrel = library.modules.find(({ file }) => file === barrelModule);
  const actual = barrel ? barrelLinesIn(barrel.source) : [];
  const expected = exported.map(barrelLine);
  return actual.join("\n") === expected.join("\n")
    ? []
    : [
        `${relative(repositoryRoot, join(library.source, barrelModule))}: re-export each public module and its types, then ${typesModule}, sorted by file name, and no internal-* module. Expected:\n${expected.join("\n")}`,
      ];
};

export const barrelOrderRule: PrimitiveRule = {
  description:
    "the barrel re-exports every public module with its types, then the shared types, in file order, and nothing internal",
  rule: barrelOrder,
};
