import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vite-plus/test";
import { kitBin } from "#/scripts/agent-kit.ts";
import { inTemporaryTree } from "#/tests/support/temporary-tree.ts";
import { repositoryRoot } from "#/tests/support/workspace.ts";

const fixtures = "tests/fixtures/solid-gate";
const lintScript = "lint:solid";

function read(path: string): string {
  return readFileSync(join(repositoryRoot, path), "utf8");
}

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

test("lint:solid runs the kit's gate over every tracked source file, those under a dot directory included", () => {
  const script: unknown = Reflect.get(JSON.parse(read("package.json")).scripts ?? {}, lintScript);
  const command = typeof script === "string" ? (script.split("&&")[0] ?? "") : "";
  const paths = command
    .trim()
    .split(/\s+/)
    .slice(2)
    .filter((arg) => !arg.startsWith("-"));
  const walked = (file: string, path: string) =>
    path === "."
      ? !file.split("/").some((segment) => segment.startsWith(".") || segment === "node_modules")
      : file.startsWith(`${path}/`);
  const unchecked = execFileSync("git", ["ls-files", "*.ts", "*.tsx", "*.jsx"], {
    cwd: repositoryRoot,
    encoding: "utf8",
  })
    .split("\n")
    .filter((file) => file !== "" && !file.endsWith(".d.ts"))
    .filter((file) => !paths.some((path) => walked(file, path)))
    .map(
      (file) => `${file}: lint:solid does not check it. Name its directory after solid2-kit check.`,
    );

  expect(command.trim().startsWith("solid2-kit check")).toBe(true);
  expect(unchecked).toEqual([]);
});
