import { web } from "@e2e-dev/web";
import type { E2EConfig } from "e2e";

const playground = {
  url: "http://127.0.0.1:0",
  command: {
    executable: process.execPath,
    args: ["dist/server/node.js"],
    cwd: "apps/playground",
    env: { PORT: "{port}", HOST: "127.0.0.1" },
    log: ".e2e/logs/playground.log",
  },
};

export default {
  tests: "apps/playground/tests/**/*.e2e.ts",
  retries: 0,
  targets: [
    { name: "chromium", engine: web({ browser: "chromium" }), app: playground },
    { name: "firefox", engine: web({ browser: "firefox" }), app: playground },
    { name: "webkit", engine: web({ browser: "webkit" }), app: playground },
  ],
} satisfies E2EConfig;
