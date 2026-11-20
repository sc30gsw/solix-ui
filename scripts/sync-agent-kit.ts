import { syncAgentKit } from "#/scripts/agent-kit.ts";
import { repositoryRoot } from "#/scripts/repository.ts";

process.stdout.write(syncAgentKit(repositoryRoot));
