import solid from "@solidjs/vite-plugin";
import { defineConfig, lazyPlugins } from "vite-plus";
import { join } from "node:path";
import { storiesProject } from "#/apps/storybook/stories-project.ts";
import { storiesServers } from "#/apps/storybook/tests/support/test-servers.ts";
import { browserInEveryEngine } from "#/scripts/browser-instances.ts";
import { storyControls } from "#/scripts/story-controls.ts";
import { nodeTestFiles, packagesBuiltFirst } from "#/tests/support/project-setups.ts";
import { seedNotice, seedVariable } from "#/tests/support/property-seed.ts";
import { anyFreePort } from "#/tests/support/server-process.ts";

const filesOwnedByOtherTools = [".agents/**", ".claude/**", "skills-lock.json"];
const tablesKeptCompact = ["AGENTS.md"];
const ruleFixtures = ["tests/fixtures/**"];
const storySpec = "apps/storybook/tests/story-spec.test.ts";
const storyRecordsSetup = "apps/storybook/story-records-command.ts";
const browserTests = "packages/primitives/tests/**/*.browser.test.{ts,tsx}";
const checkerRules = "tests/rules/**/*.test.ts";
const programOpeners = [
  "tests/rules/**",
  "tests/support/**",
  "scripts/**",
  "packages/core/tests/built-library.ts",
];
const storybookConfigDirectory = join(import.meta.dirname, "apps/storybook/.storybook");
const preBundledForBrowserTests = ["axe-core", "fast-check", "vite-plus/test/browser"];
const propertyRunner = "tests/support/properties.ts";
const fastCheckRunners = [
  "assert",
  "check",
  "configureGlobal",
  "installGlobalPlugin",
  "sample",
  "statistics",
];
const programModules = [
  "**/scripts/syntax.ts",
  "**/scripts/syntax/program.ts",
  "#/scripts/syntax.ts",
  "#/scripts/syntax/program.ts",
];
const openProgramsInTheRules = `Open a TypeScript program only in a test under tests/rules, which the rules project runs before every browser engine, or in a module under ${programOpeners.slice(1).join(", ")}.`;
const runPropertiesThroughTheWrapper = `Run a property with assertProperty from ${propertyRunner}, which gives it the time limit of the test that runs it and makes a failure report its seed, path and counterexample.`;

const fastCheckRunnersOnlyThroughTheWrapper = {
  name: "fast-check",
  importNames: fastCheckRunners,
  message: runPropertiesThroughTheWrapper,
};

const seedNoticeShown = `${seedVariable}_NOTICE_SHOWN`;
const seedNoticeText = seedNotice(process.env[seedVariable]);
if (seedNoticeText !== undefined && process.env[seedNoticeShown] === undefined) {
  process.env[seedNoticeShown] = "yes";
  process.stderr.write(`${seedNoticeText}\n`);
}

const sequenceGroup = { browser: 1, others: 2, storySpec: 3 } as const;

function inGroup(groupOrder: number) {
  return <P extends { test?: object }>(project: P) => ({
    ...project,
    test: { ...project.test, sequence: { groupOrder } },
  });
}

function withPackagesBuiltFirst<P extends { test?: object }>(project: P) {
  const own: unknown =
    project.test !== undefined && "globalSetup" in project.test ? project.test.globalSetup : [];
  const ownSetups = [own].flat().filter((file) => typeof file === "string");
  const globalSetup = [...packagesBuiltFirst, ...ownSetups].map((file) =>
    join(import.meta.dirname, file),
  );
  return { ...project, test: { ...project.test, globalSetup } };
}

const projects = [
  {
    extends: true,
    test: {
      name: "rules",
      environment: "node",
      include: [checkerRules],
    },
  },
  inGroup(sequenceGroup.browser)({
    extends: true,
    optimizeDeps: { include: preBundledForBrowserTests },
    test: {
      name: "browser",
      include: [browserTests],
      api: { port: anyFreePort, strictPort: true },
      browser: browserInEveryEngine(),
    },
  }),
  ...[
    {
      extends: true,
      plugins: [storyControls()],
      test: {
        name: "node",
        environment: "node",
        include: [...nodeTestFiles],
        exclude: ["**/node_modules/**", browserTests, ...ruleFixtures, checkerRules, storySpec],
        globalSetup: ["tests/support/global-setup.ts"],
        setupFiles: ["apps/playground/tests/support/console-check.ts"],
      },
    },
    ...storiesServers.map((server) => ({
      extends: false as const,
      ...storiesProject(server, storybookConfigDirectory),
    })),
  ].map(inGroup(sequenceGroup.others)),
  inGroup(sequenceGroup.storySpec)({
    extends: true,
    test: {
      name: "story spec",
      environment: "node",
      include: [storySpec],
      globalSetup: [storyRecordsSetup],
    },
  }),
].map(withPackagesBuiltFirst);

type NamedProject = { test?: { name?: unknown; browser?: unknown } };

export function configuredProjectNames(): string[] {
  return projects.flatMap(({ test }: NamedProject) => {
    const name = typeof test?.name === "string" ? test.name : "";
    const browser: unknown = test?.browser;
    const enabled =
      typeof browser === "object" && browser !== null && Reflect.get(browser, "enabled") === true;
    const instances: unknown = enabled ? Reflect.get(browser, "instances") : undefined;
    if (!Array.isArray(instances)) return [name];
    return instances.map(
      (instance: unknown) => `${name} (${String(Reflect.get(Object(instance), "browser"))})`,
    );
  });
}

export default defineConfig({
  plugins: lazyPlugins(() => [solid()]),
  staged: {
    "*": "vp check --fix",
  },
  fmt: {
    ignorePatterns: [...filesOwnedByOtherTools, ...tablesKeptCompact, ...ruleFixtures],
  },
  lint: {
    ignorePatterns: [...filesOwnedByOtherTools, ...ruleFixtures],
    plugins: ["typescript", "unicorn", "oxc", "import"],
    jsPlugins: [{ name: "vite-plus", specifier: "vite-plus/oxlint-plugin" }],
    rules: {
      "vite-plus/prefer-vite-plus-imports": "error",
      eqeqeq: "error",
      "no-var": "error",
      "prefer-const": "error",
      "no-console": "error",
      "no-else-return": "error",
      "func-style": ["error", "declaration", { allowArrowFunctions: true }],
      "typescript/consistent-type-imports": "error",
      "typescript/no-explicit-any": "error",
      "typescript/no-non-null-assertion": "error",
      "import/no-default-export": "error",
      "import/no-duplicates": "error",
      "unicorn/no-array-for-each": "error",
      "no-restricted-imports": [
        "error",
        {
          paths: [fastCheckRunnersOnlyThroughTheWrapper],
          patterns: [
            {
              group: programModules,
              importNames: ["openProgram"],
              message: openProgramsInTheRules,
            },
          ],
        },
      ],
      "no-restricted-properties": [
        "error",
        ...fastCheckRunners.map((property) => ({
          object: "fc",
          property,
          message: runPropertiesThroughTheWrapper,
        })),
      ],
    },
    overrides: [
      {
        files: [propertyRunner],
        rules: { "no-restricted-imports": "off", "no-restricted-properties": "off" },
      },
      {
        files: programOpeners,
        rules: {
          "no-restricted-imports": ["error", { paths: [fastCheckRunnersOnlyThroughTheWrapper] }],
        },
      },
      {
        files: ["scripts/**", "packages/*/build.mjs"],
        rules: { "no-console": "off" },
      },
      {
        files: ["packages/core/src/development-warning.ts"],
        rules: { "no-console": ["error", { allow: ["warn"] }] },
      },
      {
        files: [
          "vite.config.ts",
          "apps/*/vite.config.ts",
          "apps/*/src/App.tsx",
          "apps/playground/src/Document.tsx",
          "apps/playground/src/middleware.ts",
          "apps/storybook/**/vite.config.ts",
          "apps/storybook/**/.storybook/*.ts",
          "apps/storybook/**/*.stories.tsx",
          "apps/storybook/tests/support/story-reporter.ts",
        ],
        rules: { "import/no-default-export": "off" },
      },
    ],
    options: { typeAware: true, typeCheck: true },
  },
  test: {
    env: { [seedVariable]: process.env[seedVariable] ?? "" },
    testTimeout: 30_000,
    hookTimeout: 30_000,
    projects,
  },
});
