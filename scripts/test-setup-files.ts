import { join } from "node:path";
import { repositoryRoot } from "#/scripts/repository.ts";

export const testSetupFiles = [join(repositoryRoot, "tests/support/property-reports.ts")];
