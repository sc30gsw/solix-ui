import { execFileSync } from "node:child_process";
import { relative } from "node:path";
import { installedVp, repositoryRoot } from "#/scripts/repository.ts";
import { migrateToSubpathImports, subpathImports } from "#/scripts/subpath-imports.ts";

const changed = migrateToSubpathImports();
if (changed.length > 0) {
  execFileSync(installedVp, ["fmt", "--no-error-on-unmatched-pattern", ...changed], {
    cwd: repositoryRoot,
    stdio: "inherit",
  });
}
for (const file of changed) console.log(relative(repositoryRoot, file));
console.log(
  `${changed.length} files now import their own package through ${Object.keys(subpathImports).join(", ")}.`,
);
