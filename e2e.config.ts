import { web } from "@e2e-dev/web";
import type { E2EConfig } from "e2e";
import { enginesToVerify } from "#/scripts/browser-engines.mjs";

const browsers = ["chromium", "firefox", "webkit"] as const;

type BrowserName = (typeof browsers)[number];

function browserNamed(engine: string): BrowserName {
  const browser = browsers.find((each) => each === engine);
  if (browser === undefined) {
    throw new Error(`e2e.config.ts: web() drives no browser named ${engine}.`);
  }
  return browser;
}

function servedPlayground(engine: string) {
  return {
    url: "http://127.0.0.1:0",
    command: {
      executable: process.execPath,
      args: ["dist/server/node.js"],
      cwd: "apps/playground",
      env: { PORT: "{port}", HOST: "127.0.0.1" },
      log: `.e2e/logs/playground-${engine}.log`,
    },
  };
}

export default {
  tests: "apps/playground/tests/**/*.e2e.ts",
  retries: 0,
  targets: enginesToVerify().map((engine: string) => ({
    name: engine,
    engine: web({ browser: browserNamed(engine) }),
    app: servedPlayground(engine),
  })),
} satisfies E2EConfig;
