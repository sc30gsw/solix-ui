import { writeFileSync } from "node:fs";
import { inject, test } from "vite-plus/test";

test("reports the playground this run serves, and holds the run open when asked", async () => {
  const url = inject("playgroundUrl");
  const response = await fetch(url);
  writeFileSync(String(process.env.PROBE_REPORT), JSON.stringify({ url, ok: response.ok }));
  if (process.env.PROBE_HOLDS === "yes") await new Promise(() => undefined);
});
