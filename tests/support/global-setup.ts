import { execFileSync } from "node:child_process";
import { join, relative } from "node:path";
import type { TestProject } from "vite-plus/test/node";
import { installedVp, repositoryRoot } from "#/scripts/repository.ts";
import { gitVariablesIn } from "#/tests/support/git-free-environment.ts";
import { localUrl, startServer } from "#/tests/support/server-process.ts";
import { withoutTestRunnerVariables } from "#/tests/support/test-runner-environment.ts";

const playgroundDirectory = join(repositoryRoot, "apps/playground");
const playgroundPort = 4319;

export type TestFilesOfEachProject = Readonly<Record<string, readonly string[]>>;

export type RunSettings = {
  testNamePattern: string | null;
  env: Record<string, string>;
  provided: Record<string, unknown>;
  inABrowser: boolean;
  groupOrder: number;
};

declare module "vite-plus/test" {
  interface ProvidedContext {
    playgroundUrl: string;
    testFilesOfEachProject: Record<string, string[]>;
    runTestNamePattern: string | null;
    runSettingsOfEachProject: Record<string, RunSettings>;
  }
}

function patternOf(pattern: RegExp | string | undefined): string | null {
  return pattern === undefined ? null : String(pattern);
}

function runSettingsOfEachProject(project: TestProject): Record<string, RunSettings> {
  return Object.fromEntries(
    project.vitest.projects.map(({ name, config }) => [
      name,
      {
        testNamePattern: patternOf(config.testNamePattern),
        env: Object.fromEntries(
          Object.entries(config.env ?? {}).map(([key, value]) => [key, String(value)]),
        ),
        provided: { ...config.provide },
        inABrowser: config.browser.enabled,
        groupOrder: config.sequence.groupOrder,
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
  const gitVariables = gitVariablesIn(process.env);
  if (gitVariables.length > 0) {
    throw new Error(
      `tests/support/global-setup.ts: ${gitVariables.join(", ")} reach this setup, and every child it spawns would inherit them. List tests/support/git-free-environment.ts before it in globalSetup.`,
    );
  }
  project.provide("testFilesOfEachProject", await testFilesOfEachProject(project));
  project.provide("runTestNamePattern", patternOf(project.vitest.config.testNamePattern));
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
