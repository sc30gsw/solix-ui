import solid from "@solidjs/vite-plugin";
import { defineConfig, lazyPlugins } from "vite-plus";

const filesOwnedByOtherTools = [".agents/**", ".claude/**", "skills-lock.json"];
const generatedEvidence = ["docs/verification/**"];
const tablesKeptCompact = ["AGENTS.md"];

export default defineConfig({
  plugins: lazyPlugins(() => [solid()]),
  staged: {
    "*": "vp check --fix",
    "*.{ts,tsx,jsx}": "solid2-kit check",
  },
  fmt: {
    ignorePatterns: [...filesOwnedByOtherTools, ...generatedEvidence, ...tablesKeptCompact],
  },
  lint: {
    ignorePatterns: filesOwnedByOtherTools,
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
        files: ["vite.config.ts", "apps/*/vite.config.ts", "apps/*/src/App.tsx"],
        rules: { "import/no-default-export": "off" },
      },
    ],
    options: { typeAware: true, typeCheck: true },
  },
  test: {
    environment: "node",
    include: [
      "tests/**/*.test.ts",
      "packages/*/tests/**/*.test.{ts,tsx}",
      "apps/*/tests/**/*.test.{ts,tsx}",
    ],
    globalSetup: ["tests/support/global-setup.ts"],
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
