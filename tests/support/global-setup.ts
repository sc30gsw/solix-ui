import { execFileSync } from "node:child_process";
import { join } from "node:path";

const repositoryRoot = join(import.meta.dirname, "../..");

function productionEnvironment(): NodeJS.ProcessEnv {
  const withoutTestRunnerVariables = Object.fromEntries(
    Object.entries(process.env).filter(([name]) => !/^(VITEST|VITE_|TEST$|MODE$)/.test(name)),
  );
  return { ...withoutTestRunnerVariables, NODE_ENV: "production" };
}

export function setup(): void {
  execFileSync(join(repositoryRoot, "node_modules/.bin/vp"), ["run", "-r", "build"], {
    cwd: repositoryRoot,
    env: productionEnvironment(),
    stdio: "inherit",
  });
}
