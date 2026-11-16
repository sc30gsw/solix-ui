import { execFileSync } from "node:child_process";
import { join } from "node:path";
import type { TestProject } from "vite-plus/test/node";
import { installedVp, repositoryRoot } from "../../scripts/repository";
import { localUrl, startServer } from "./server-process";

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
  execFileSync(installedVp, ["run", "-r", "build"], {
    cwd: repositoryRoot,
    env: productionEnvironment(),
    stdio: "inherit",
  });
  try {
    const playground = await startServer({
      directory: playgroundDirectory,
      port: playgroundPort,
      command: ["node", "dist/server/node.js"],
    });
    project.provide("playgroundUrl", playground.url);
    return playground.stop;
  } catch (error) {
    process.stderr.write(
      `The playground did not start, so every test that opens it fails. The tests that need no page still run and say what they find.\n${String(error)}`,
    );
    project.provide("playgroundUrl", localUrl(playgroundPort));
    return () => undefined;
  }
}
