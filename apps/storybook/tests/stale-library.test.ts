import { appendFileSync, cpSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { createServer } from "vite-plus";
import { expect, test } from "vite-plus/test";
import { repositoryRoot } from "../../../scripts/repository.ts";
import { storyControls, storyControlsModule } from "../../../scripts/story-controls.ts";
import { inTemporaryTree } from "../../../tests/support/temporary-tree.ts";

const core = join(repositoryRoot, "packages/core");

test("the stories refuse a library whose dist was built before its sources last changed, and say how to rebuild it, in Storybook's server, its static build and the stories projects, which all load the controls module", async () => {
  await inTemporaryTree({}, async (root) => {
    const copy = join(root, "core");
    for (const part of ["src", "dist", "package.json"]) {
      cpSync(join(core, part), join(copy, part), { recursive: true });
    }
    symlinkSync(join(core, "node_modules"), join(copy, "node_modules"), "dir");
    appendFileSync(join(copy, "src/Button.tsx"), "\n");
    const server = await createServer({
      root,
      configFile: false,
      logLevel: "silent",
      plugins: [storyControls(join(copy, "src/index.ts"))],
      server: { middlewareMode: true, hmr: false },
    });
    try {
      await expect(server.transformRequest(storyControlsModule, { ssr: true })).rejects.toThrow(
        /core\/dist was built from other sources than .*core\/src holds now.*run `vp run -r build`/,
      );
    } finally {
      await server.close();
    }
  });
});
