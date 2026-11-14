import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { expect, test } from "vite-plus/test";

const builtEntry = join(import.meta.dirname, "../dist/index.js");

function functionNames(module: Record<string, unknown>): string[] {
  return Object.keys(module)
    .filter((name) => typeof module[name] === "function")
    .sort();
}

function functionNamesSeenByNode(): string[] {
  const script = `const built = await import(${JSON.stringify(pathToFileURL(builtEntry).href)});
console.log(JSON.stringify(Object.keys(built).filter((name) => typeof built[name] === "function").sort()));`;
  const printed = execFileSync(process.execPath, ["--input-type=module", "--eval", script], {
    encoding: "utf8",
  });
  return JSON.parse(printed) as string[];
}

test("Node's own loader, outside Vite, imports the built package and finds every function Vite finds", async () => {
  const seenByVite = functionNames((await import(builtEntry)) as Record<string, unknown>);

  expect(seenByVite.length).toBeGreaterThan(0);
  expect(functionNamesSeenByNode()).toEqual(seenByVite);
});
