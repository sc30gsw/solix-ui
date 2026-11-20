import { copyKitSkills } from "#/scripts/agent-kit.ts";
import { repositoryRoot } from "#/scripts/repository.ts";

for (const name of copyKitSkills(repositoryRoot)) process.stdout.write(`${name}\n`);
