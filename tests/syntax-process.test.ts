import { execFileSync, spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { expect, test } from "vite-plus/test";
import { descendants, parse, ts } from "../scripts/syntax";
import { repositoryRoot } from "./support/workspace";

const compilerModule = pathToFileURL(join(repositoryRoot, "scripts/syntax/program.ts")).href;
const driveScript = ".agents/skills/verify-playground/scripts/drive.mjs";
const moduleLoader = "repositoryModule";
const plainNodeTimeout = 30_000;
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

function modulesTheDriveScriptLoads(): string[] {
  return descendants(parse(join(repositoryRoot, driveScript))).flatMap((node) =>
    ts.isCallExpression(node) &&
    ts.isIdentifier(node.expression) &&
    node.expression.text === moduleLoader &&
    node.arguments[0] !== undefined &&
    ts.isStringLiteral(node.arguments[0])
      ? [node.arguments[0].text]
      : [],
  );
}

test("Node's own loader imports every repository module the playground's drive script loads", () => {
  const modules = modulesTheDriveScriptLoads();
  const failures = modules.flatMap((path) => {
    const url = pathToFileURL(join(repositoryRoot, path)).href;
    const result = spawnSync(
      process.execPath,
      ["--input-type=module", "-e", `await import(${JSON.stringify(url)});`],
      { cwd: repositoryRoot, encoding: "utf8", timeout: plainNodeTimeout },
    );
    return result.status === 0 && result.stderr === "" ? [] : [`${path}: ${result.stderr}`];
  });

  expect(modules).toContain("scripts/expected-values.ts");
  expect(failures).toEqual([]);
});
