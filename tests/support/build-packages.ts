import { execFileSync } from "node:child_process";
import { installedVp, repositoryRoot } from "#/scripts/repository.ts";
import { gitVariablesIn } from "#/tests/support/git-free-environment.ts";
import { withoutTestRunnerVariables } from "#/tests/support/test-runner-environment.ts";

const packagesBuilt = Symbol.for("solix.packagesBuilt");

export function productionEnvironment(): NodeJS.ProcessEnv {
  return { ...withoutTestRunnerVariables(), NODE_ENV: "production" };
}

export function setup(): void {
  if (Reflect.get(process, packagesBuilt) === true) return;
  const gitVariables = gitVariablesIn(process.env);
  if (gitVariables.length > 0) {
    throw new Error(
      `tests/support/build-packages.ts: ${gitVariables.join(", ")} reach this setup, and every child it spawns would inherit them. List tests/support/git-free-environment.ts before it in globalSetup.`,
    );
  }
  execFileSync(installedVp, ["run", "-r", "build"], {
    cwd: repositoryRoot,
    env: productionEnvironment(),
    stdio: "inherit",
  });
  Reflect.set(process, packagesBuilt, true);
}
