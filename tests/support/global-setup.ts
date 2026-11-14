import { execFileSync } from "node:child_process";
import { join } from "node:path";
import type { TestProject } from "vite-plus/test/node";
import { startServer } from "./server-process";

const repositoryRoot = join(import.meta.dirname, "../..");
const playgroundDirectory = join(repositoryRoot, "apps/playground");
const playgroundPort = 4319;

declare module "vite-plus/test" {
  interface ProvidedContext {
    playgroundUrl: string;
  }
}

function productionEnvironment(): NodeJS.ProcessEnv {
  const withoutTestRunnerVariables = Object.fromEntries(
    Object.entries(process.env).filter(([name]) => !/^(VITEST|VITE_|TEST$|MODE$)/.test(name)),
  );
  return { ...withoutTestRunnerVariables, NODE_ENV: "production" };
}

export async function setup(project: TestProject): Promise<() => void> {
  execFileSync(join(repositoryRoot, "node_modules/.bin/vp"), ["run", "-r", "build"], {
    cwd: repositoryRoot,
    env: productionEnvironment(),
    stdio: "inherit",
  });
  const playground = await startServer({
    directory: playgroundDirectory,
    port: playgroundPort,
    command: ["node", "dist/server/node.js"],
  });
  project.provide("playgroundUrl", playground.url);
  return playground.stop;
}
