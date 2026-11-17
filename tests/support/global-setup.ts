import { execFileSync } from "node:child_process";
import { join, relative } from "node:path";
import type { TestProject } from "vite-plus/test/node";
import { installedVp, repositoryRoot } from "#/scripts/repository.ts";
import { localUrl, startServer } from "#/tests/support/server-process.ts";
import { withoutTestRunnerVariables } from "#/tests/support/test-runner-environment.ts";

const playgroundDirectory = join(repositoryRoot, "apps/playground");
const playgroundPort = 4319;

export type { RunSettings };

declare module "vite-plus/test" {
  interface ProvidedContext {
    playgroundUrl: string;
    testFilesOfEachProject: Record<string, string[]>;
    runSettingsOfEachProject: Record<string, RunSettings>;
  }
}

type RunSettings = {
  testNamePattern: string | null;
  runTestNamePattern: string | null;
  env: Record<string, string>;
};

function patternOf(pattern: RegExp | string | undefined): string | null {
  return pattern === undefined ? null : String(pattern);
}

function runSettingsOfEachProject(project: TestProject): Record<string, RunSettings> {
  const runTestNamePattern = patternOf(project.vitest.config.testNamePattern);
  return Object.fromEntries(
    project.vitest.projects.map(({ name, config }) => [
      name,
      {
        testNamePattern: patternOf(config.testNamePattern),
        runTestNamePattern,
        env: Object.fromEntries(
          Object.entries(config.env ?? {}).map(([key, value]) => [key, String(value)]),
        ),
      },
    ]),
  );
}

function productionEnvironment(): NodeJS.ProcessEnv {
  return { ...withoutTestRunnerVariables(), NODE_ENV: "production" };
}

async function testFilesOfEachProject(project: TestProject): Promise<Record<string, string[]>> {
  const listed: Record<string, string[]> = {};
  for (const specification of await project.vitest.globTestSpecifications()) {
    const name = specification.project.name;
    listed[name] = [...(listed[name] ?? []), relative(repositoryRoot, specification.moduleId)];
  }
  return listed;
}

export async function setup(project: TestProject): Promise<() => void> {
  project.provide("testFilesOfEachProject", await testFilesOfEachProject(project));
  project.provide("runSettingsOfEachProject", runSettingsOfEachProject(project));
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
