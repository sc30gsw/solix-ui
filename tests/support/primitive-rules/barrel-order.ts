import { join, relative } from "node:path";
import { fileNamedBy } from "#/scripts/subpath.ts";
import { exportsOf, ts } from "#/scripts/syntax.ts";
import { repositoryRoot } from "#/tests/support/workspace.ts";
import {
  barrelModule,
  constantsModule,
  isPublic,
  type Module,
  type PrimitiveRule,
  type Rule,
  typesModule,
} from "#/tests/support/primitive-rules/library.ts";

function exportLine(names: readonly string[], file: string | undefined): string {
  return `export { ${names.join(", ")} } from ${file ? relative(repositoryRoot, file) : "a module that names no file"};`;
}

function barrelLine(module: Module): string {
  const { functions, others, types } = exportsOf(module.source);
  return exportLine(
    [...functions, ...others, ...types.sort().map((type) => `type ${type}`)],
    module.path,
  );
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
    return exportLine(names, fileNamedBy(barrel.fileName, statement.moduleSpecifier.text));
  });
}

const barrelOrder: Rule = (library) => {
  const exported = library.modules.filter(
    ({ file }) => isPublic(file) || file === constantsModule || file === typesModule,
  );
  const barrel = library.modules.find(({ file }) => file === barrelModule);
  const actual = barrel ? barrelLinesIn(barrel.source) : [];
  const barrelFile = join(library.source, barrelModule);
  const expected = exported.map(barrelLine);
  return actual.join("\n") === expected.join("\n")
    ? []
    : [
        `${relative(repositoryRoot, barrelFile)}: re-export each public module and its types, ${constantsModule} and ${typesModule}, sorted by file name, and no internal-* module. Expected:\n${expected.join("\n")}`,
      ];
};

export const barrelOrderRule: PrimitiveRule = {
  description:
    "the barrel re-exports every public module with its types, the shared constants and the shared types, in file order, and nothing internal",
  rule: barrelOrder,
};
