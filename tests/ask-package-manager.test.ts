import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vite-plus/test";
import {
  askPackageManager,
  PackageManagerQueryFailed,
  pinnedVitePlus,
  VitePlusNotFound,
  VitePlusVersionMismatch,
  type VpCandidate,
} from "#/scripts/repository.ts";
import { callsOf, writeVpShim } from "#/tests/support/shims.ts";

const query = ["pm", "config", "list", "--json"];
const temporary: string[] = [];

afterEach(() => {
  for (const directory of temporary.splice(0)) rmSync(directory, { recursive: true });
});

function temporaryDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), "ask-package-manager-"));
  temporary.push(directory);
  return directory;
}

function ask(directory: string, candidates: readonly VpCandidate[]): string {
  return askPackageManager(
    query,
    { cwd: directory, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    candidates,
  );
}

function thrownBy(run: () => unknown): unknown {
  try {
    run();
  } catch (error) {
    return error;
  }
  throw new Error("it did not throw");
}

test("the first candidate that is installed answers, and the next one never runs", () => {
  const directory = temporaryDirectory();
  const first = writeVpShim(directory, "first", { version: pinnedVitePlus(), answer: "first" });
  const second = writeVpShim(directory, "second", { version: pinnedVitePlus(), answer: "second" });

  expect(ask(directory, [{ command: first }, { command: second }])).toBe("first");
  expect(callsOf(first)).toEqual(["--version", query.join(" ")]);
  expect(callsOf(second)).toEqual([]);
});

test("a first candidate that is not installed hands the question to the next", () => {
  const directory = temporaryDirectory();
  const second = writeVpShim(directory, "second", { version: pinnedVitePlus(), answer: "second" });

  expect(ask(directory, [{ command: join(directory, "missing") }, { command: second }])).toBe(
    "second",
  );
});

test("a candidate with a script runs it with the Node that runs this process", () => {
  const directory = temporaryDirectory();
  const script = join(directory, "vp.mjs");
  writeFileSync(
    script,
    `process.stdout.write(process.argv[2] === "--version" ? "vp v${pinnedVitePlus()}\\n" : process.argv.slice(2).join(" "));\n`,
  );

  expect(
    ask(directory, [
      { command: join(directory, "missing") },
      { command: process.execPath, script },
    ]),
  ).toBe(query.join(" "));
});

test("when no candidate is installed, it fails with VitePlusNotFound, which names each one and the way to install Vite+", () => {
  const directory = temporaryDirectory();
  const missing = join(directory, "missing");
  const missingScript = join(directory, "node_modules/vite-plus/bin/vp");
  const error = thrownBy(() =>
    ask(directory, [{ command: missing }, { command: process.execPath, script: missingScript }]),
  );

  expect(error).toBeInstanceOf(VitePlusNotFound);
  expect((error as VitePlusNotFound).tried).toEqual([
    missing,
    `${process.execPath} ${missingScript}`,
  ]);
  expect((error as Error).message).toMatch(/Install Vite\+, then run `vp install`/);
});

test("a candidate that exits non-zero fails the question with the command it ran, and the next one never runs", () => {
  const directory = temporaryDirectory();
  const first = writeVpShim(directory, "first", { version: pinnedVitePlus(), status: 3 });
  const second = writeVpShim(directory, "second", { version: pinnedVitePlus(), answer: "second" });
  const error = thrownBy(() => ask(directory, [{ command: first }, { command: second }]));

  expect(error).toBeInstanceOf(PackageManagerQueryFailed);
  expect(error).toMatchObject({
    command: `${first} ${query.join(" ")}`,
    status: 3,
    message: `${first} ${query.join(" ")} exited with 3: failed on purpose.`,
  });
  expect(callsOf(second)).toEqual([]);
});

test("a vp of another release than the one the repository installs fails with VitePlusVersionMismatch before it is asked, and the next one never runs", () => {
  const directory = temporaryDirectory();
  const first = writeVpShim(directory, "first", { version: "0.0.1", answer: "first" });
  const second = writeVpShim(directory, "second", { version: pinnedVitePlus(), answer: "second" });
  const error = thrownBy(() => ask(directory, [{ command: first }, { command: second }]));

  expect(error).toBeInstanceOf(VitePlusVersionMismatch);
  expect(error).toMatchObject({
    command: `${first} --version`,
    found: "0.0.1",
    pinned: pinnedVitePlus(),
  });
  expect(callsOf(first)).toEqual(["--version"]);
  expect(callsOf(second)).toEqual([]);
});

test("a working directory that does not exist fails on its own, before any candidate runs", () => {
  const directory = temporaryDirectory();
  const first = writeVpShim(directory, "first", { version: pinnedVitePlus(), answer: "first" });
  const gone = join(directory, "gone");

  expect(() => ask(gone, [{ command: first }])).toThrow(
    `vp ${query.join(" ")} cannot run in ${gone}, which is not a directory.`,
  );
  expect(callsOf(first)).toEqual([]);
});

test("each candidate is asked its version once in a process", () => {
  const directory = temporaryDirectory();
  const first = writeVpShim(directory, "first", { version: pinnedVitePlus(), answer: "first" });

  ask(directory, [{ command: first }]);
  ask(directory, [{ command: first }]);

  expect(callsOf(first)).toEqual(["--version", query.join(" "), query.join(" ")]);
});
