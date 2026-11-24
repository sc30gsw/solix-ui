import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { migrationFile, migrationMarkdown } from "#/scripts/migration.ts";
import { repositoryRoot } from "#/scripts/repository.ts";

writeFileSync(join(repositoryRoot, migrationFile), migrationMarkdown());
