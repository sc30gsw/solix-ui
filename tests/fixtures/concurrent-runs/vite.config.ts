import { join } from "node:path";
import { defineConfig } from "vite-plus";

const support = join(import.meta.dirname, "../../support");

export default defineConfig({
  root: import.meta.dirname,
  test: {
    include: ["probe.test.ts"],
    environment: "node",
    testTimeout: 120_000,
    globalSetup: [join(support, "git-free-environment.ts"), join(support, "global-setup.ts")],
  },
});
