import { copyKitSkills } from "#/scripts/agent-kit.ts";
import { kitSkills } from "#/scripts/package-skills.ts";
import { repositoryRoot } from "#/scripts/repository.ts";

for (const name of copyKitSkills(repositoryRoot, kitSkills)) process.stdout.write(`${name}\n`);
