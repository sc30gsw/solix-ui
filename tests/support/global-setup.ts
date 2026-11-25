import { join, relative } from "node:path";
import type { TestProject } from "vite-plus/test/node";
import { repositoryRoot } from "#/scripts/repository.ts";
import { startServer } from "#/tests/support/server-process.ts";

const playgroundDirectory = join(repositoryRoot, "apps/playground");
const unservedUrl = "http://playground-did-not-start.invalid/";

export type TestFilesOfEachProject = Readonly<Record<string, readonly string[]>>;

export type RunSettings = {
  testNamePattern: string | null;
  env: Record<string, string>;
  provided: Record<string, unknown>;
  groupOrder: number;
  globalSetup: string[];
  setupFiles: string[];
  browser: { enabled: boolean; screenshotFailures: boolean };
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
        groupOrder: config.sequence.groupOrder,
        globalSetup: [config.globalSetup].flat().map((file) => relative(repositoryRoot, file)),
        setupFiles: [config.setupFiles].flat().map((file) => relative(repositoryRoot, file)),
        browser: {
          enabled: config.browser.enabled,
          screenshotFailures: config.browser.screenshotFailures,
        },
      },
    ]),
  );
}

async function testFilesOfEachProject(project: TestProject): Promise<Record<string, string[]>> {
  const listed: Record<string, string[]> = {};
  for (const specification of await project.vitest.globTestSpecifications()) {
    const name = specification.project.name;
    listed[name] = [...(listed[name] ?? []), relative(repositoryRoot, specification.moduleId)];
  }
  return listed;
}

export async function setup(project: TestProject): Promise<() => Promise<void>> {
  project.provide("testFilesOfEachProject", await testFilesOfEachProject(project));
  project.provide("runTestNamePattern", patternOf(project.vitest.config.testNamePattern));
  project.provide("runSettingsOfEachProject", runSettingsOfEachProject(project));
  try {
    const playground = await startServer({
      directory: playgroundDirectory,
      command: ["node", "dist/server/node.js"],
    });
    project.provide("playgroundUrl", playground.url);
    return playground.stop;
  } catch (error) {
    process.stderr.write(
      `The playground did not start, so every test that opens it fails. The tests that need no page still run and say what they find.\n${String(error)}`,
    );
    project.provide("playgroundUrl", unservedUrl);
    return async () => undefined;
  }
}
