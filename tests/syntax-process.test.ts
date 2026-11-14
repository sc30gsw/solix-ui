import { execFileSync, spawn } from "node:child_process";
import { once } from "node:events";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { expect, test } from "vite-plus/test";
import { repositoryRoot } from "./support/workspace";

const compilerModule = pathToFileURL(join(repositoryRoot, "tests/support/syntax/program.ts")).href;
const parsedSignal = "parsed";
const parentScript = `
const { parse } = await import(${JSON.stringify(compilerModule)});
parse(${JSON.stringify(join(repositoryRoot, "vite.config.ts"))});
process.stdout.write(${JSON.stringify(`${parsedSignal}\n`)});
process.stdin.once("data", () => process.exit(0));
`;

function childrenOf(pid: number): number[] {
  try {
    return execFileSync("pgrep", ["-P", String(pid)], { encoding: "utf8" })
      .split("\n")
      .filter((line) => line.trim() !== "")
      .map(Number);
  } catch {
    return [];
  }
}

function isRunning(pid: number): boolean {
  try {
    const state = execFileSync("ps", ["-o", "stat=", "-p", String(pid)], { encoding: "utf8" });
    return state.trim() !== "" && !state.trim().startsWith("Z");
  } catch {
    return false;
  }
}

test.each([
  { ending: "exits", end: (parent: ReturnType<typeof spawn>) => parent.stdin?.write("exit\n") },
  { ending: "is killed", end: (parent: ReturnType<typeof spawn>) => parent.kill("SIGKILL") },
])(
  "the TypeScript API process ends when the process that parsed with it $ending",
  async ({ end }) => {
    const parent = spawn(process.execPath, ["--input-type=module", "-e", parentScript], {
      cwd: repositoryRoot,
      stdio: ["pipe", "pipe", "inherit"],
    });
    const [chunk] = (await once(parent.stdout, "data")) as [Buffer];
    const compilers = childrenOf(parent.pid ?? 0);

    expect(chunk.toString()).toBe(`${parsedSignal}\n`);
    expect(compilers).toHaveLength(1);
    end(parent);
    await once(parent, "exit");
    await expect.poll(() => compilers.filter(isRunning), { timeout: 5_000 }).toEqual([]);
  },
);
