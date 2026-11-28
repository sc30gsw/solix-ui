import { join } from "node:path";
import { resolveConfig } from "vite-plus";
import { expect, test } from "vite-plus/test";

const appDirectory = join(import.meta.dirname, "..");
const agentVariable = "AI_AGENT";

test("the development server forwards no console of a browser page to its own output, even when an agent runs it, so what it prints is only its own", async () => {
  const before = process.env[agentVariable];
  process.env[agentVariable] = "any";
  try {
    const config = await resolveConfig(
      { root: appDirectory, configFile: join(appDirectory, "vite.config.ts"), logLevel: "silent" },
      "serve",
    );

    expect(config.server.forwardConsole.enabled).toBe(false);
  } finally {
    if (before === undefined) Reflect.deleteProperty(process.env, agentVariable);
    else process.env[agentVariable] = before;
  }
});
