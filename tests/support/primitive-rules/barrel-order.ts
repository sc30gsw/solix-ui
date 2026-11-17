import { join, relative } from "node:path";
import { subpathSpecifierOf } from "#/scripts/subpath-imports.ts";
import { exportsOf, ts } from "#/scripts/syntax.ts";
import { repositoryRoot } from "#/tests/support/workspace.ts";
import {
  barrelModule,
  isPublic,
  type Module,
  type PrimitiveRule,
  type Rule,
  typesModule,
} from "#/tests/support/primitive-rules/library.ts";

function barrelLine(barrel: string, module: Module): string {
  const { functions, types } = exportsOf(module.source);
  const names = [...functions, ...types.sort().map((type) => `type ${type}`)];
  return `export { ${names.join(", ")} } from "${subpathSpecifierOf(barrel, module.path)}";`;
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
  const barrelFile = join(library.source, barrelModule);
  const expected = exported.map((module) => barrelLine(barrelFile, module));
  return actual.join("\n") === expected.join("\n")
    ? []
    : [
        `${relative(repositoryRoot, barrelFile)}: re-export each public module and its types, then ${typesModule}, sorted by file name, and no internal-* module. Expected:\n${expected.join("\n")}`,
      ];
};

export const barrelOrderRule: PrimitiveRule = {
  description:
    "the barrel re-exports every public module with its types, then the shared types, in file order, and nothing internal",
  rule: barrelOrder,
};
