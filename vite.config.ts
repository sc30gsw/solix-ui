import solid from "@solidjs/vite-plugin";
import { defineConfig, lazyPlugins } from "vite-plus";
import { join } from "node:path";
import { storiesProject } from "#/apps/storybook/stories-project.ts";
import { storiesServers } from "#/apps/storybook/tests/support/test-servers.ts";
import { browserInEveryEngine } from "#/scripts/browser-instances.ts";

const filesOwnedByOtherTools = [".agents/**", ".claude/**", "skills-lock.json"];
const generatedEvidence = ["docs/verification/**"];
const tablesKeptCompact = ["AGENTS.md"];
const ruleFixtures = ["tests/fixtures/**"];
const browserTests = "packages/primitives/tests/**/*.browser.test.{ts,tsx}";
const browserTestServerPort = 4322;
const storybookConfigDirectory = join(import.meta.dirname, "apps/storybook/.storybook");
const preBundledForBrowserTests = ["axe-core", "fast-check", "vite-plus/test/browser"];

export default defineConfig({
  plugins: lazyPlugins(() => [solid()]),
  staged: {
    "*": "vp check --fix",
    "*.{ts,tsx,jsx}": "solid2-kit check",
  },
  fmt: {
    ignorePatterns: [
      ...filesOwnedByOtherTools,
      ...generatedEvidence,
      ...tablesKeptCompact,
      ...ruleFixtures,
    ],
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
    },
    overrides: [
      {
        files: ["scripts/**", "packages/*/build.mjs"],
        rules: { "no-console": "off" },
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
    testTimeout: 30_000,
    hookTimeout: 30_000,
    projects: [
      {
        extends: true,
        test: {
          name: "node",
          environment: "node",
          include: [
            "tests/**/*.test.ts",
            "packages/*/tests/**/*.test.{ts,tsx}",
            "apps/*/tests/**/*.test.{ts,tsx}",
          ],
          exclude: ["**/node_modules/**", browserTests, ...ruleFixtures],
          globalSetup: ["tests/support/global-setup.ts"],
        },
      },
      {
        extends: true,
        optimizeDeps: { include: preBundledForBrowserTests },
        test: {
          name: "browser",
          include: [browserTests],
          api: { port: browserTestServerPort, strictPort: true },
          browser: browserInEveryEngine(),
        },
      },
      ...storiesServers.map((server) => ({
        extends: false as const,
        ...storiesProject(server, storybookConfigDirectory),
      })),
    ],
  },
});
