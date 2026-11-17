import solid from "@solidjs/vite-plugin";
import { defineConfig, lazyPlugins } from "vite-plus";
import { browserInEveryEngine } from "#/scripts/browser-instances.ts";

const filesOwnedByOtherTools = [".agents/**", ".claude/**", "skills-lock.json"];
const generatedEvidence = ["docs/verification/**"];
const tablesKeptCompact = ["AGENTS.md"];
const ruleFixtures = ["tests/fixtures/**"];
const browserTests = "packages/primitives/tests/**/*.browser.test.{ts,tsx}";
const browserTestServerPort = 4322;
const storiesProjectConfig = "apps/storybook/vite.config.ts";
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
const runPropertiesThroughTheWrapper = `Run a property with assertProperty from ${propertyRunner}, which gives it the time limit of the test that runs it and makes a failure report its seed, path and counterexample.`;

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
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "fast-check",
              importNames: fastCheckRunners,
              message: runPropertiesThroughTheWrapper,
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
        files: ["scripts/**", "packages/*/build.mjs"],
        rules: { "no-console": "off" },
      },
      {
        files: [
          "vite.config.ts",
          "apps/*/vite.config.ts",
          "apps/*/src/App.tsx",
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
      storiesProjectConfig,
    ],
  },
});
