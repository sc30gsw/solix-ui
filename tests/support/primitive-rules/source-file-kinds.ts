import { join, relative } from "node:path";
import { repositoryRoot } from "../workspace";
import { kebabCaseModule, type PrimitiveRule, type Rule, typesModule } from "./library";

const sourceFileKinds: Rule = (library) =>
  library.entries
    .filter((entry) => !kebabCaseModule.test(entry))
    .map((entry) =>
      entry.endsWith(".ts")
        ? `${relative(repositoryRoot, join(library.source, entry))}: name a module in kebab-case: a public module such as create-<name>.ts or get-<name>.ts, a helper that no consumer imports internal-<topic>.ts, and the shared types ${typesModule}.`
        : `${relative(repositoryRoot, join(library.source, entry))}: write it as a .ts module.`,
    );

export const sourceFileKindsRule: PrimitiveRule = {
  description: "every source file of the primitives package is a kebab-case .ts module",
  rule: sourceFileKinds,
};
