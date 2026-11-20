import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vite-plus/test";
import { kitBin } from "#/scripts/agent-kit.ts";
import { inTemporaryTree } from "#/tests/support/temporary-tree.ts";
import { repositoryRoot } from "#/tests/support/workspace.ts";

const fixtures = "tests/fixtures/solid-gate";

test.each([["props-destructure.txt", "[props-destructure-body]"]])(
  "the kit's gate fails the component in %s with %s, so lint:solid can fail",
  async (fixture, finding) => {
    await inTemporaryTree(
      { "Component.tsx": readFileSync(join(repositoryRoot, fixtures, fixture), "utf8") },
      (root) => {
        const run = spawnSync(
          process.execPath,
          [join(repositoryRoot, kitBin), "check", "Component.tsx"],
          {
            cwd: root,
            encoding: "utf8",
          },
        );

        expect(run.status).toBe(1);
        expect(`${run.stdout}${run.stderr}`).toContain(finding);
      },
    );
  },
);
