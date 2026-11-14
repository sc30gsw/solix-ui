import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vite-plus/test";
import { repositoryRoot } from "./support/workspace";

const script = join(repositoryRoot, "scripts/check-private-terms.mjs");
const commitMessageHook = join(repositoryRoot, ".vite-hooks/commit-msg");
const madeUpTerm = "zorblax";
const otherMadeUpTerm = "quindle widgets";
const scissors = "# ------------------------ >8 ------------------------";

function temporaryDirectory(): string {
  return mkdtempSync(join(tmpdir(), "private-terms-"));
}

function textFile(content: string): string {
  const path = join(temporaryDirectory(), "text.md");
  writeFileSync(path, content);
  return path;
}

function run(command: string, args: string[], terms: string | undefined, cwd = repositoryRoot) {
  const env = { ...process.env };
  delete env.SOLIX_PRIVATE_TERMS;
  if (terms !== undefined) env.SOLIX_PRIVATE_TERMS = terms;
  return spawnSync(command, args, { cwd, env, encoding: "utf8" });
}

function check(args: string[], terms: string | undefined, cwd = repositoryRoot) {
  return run("node", [script, ...args], terms, cwd);
}

test("text names a term in any case, and the report gives each line but never the term", () => {
  const path = textFile(
    ["fine", "built like ZorBlax", "Quindle Widgets inside", "zorbla x"].join("\n"),
  );
  const result = check(["--text", path], ` Zorblax ,quindle widgets\n\n,`);

  expect(result.status).toBe(1);
  expect(result.stderr).toContain(`${path}:2:`);
  expect(result.stderr).toContain(`${path}:3:`);
  expect(result.stderr).not.toContain(`${path}:4:`);
  expect(result.stderr.toLowerCase()).not.toContain(madeUpTerm);
  expect(result.stderr.toLowerCase()).not.toContain(otherMadeUpTerm);
});

test("the commit-msg hook rejects a message that names a term and ignores what git strips", () => {
  const naming = textFile(["feat: add a thing", "", "Built like zorblax."].join("\n"));
  const strippedOnly = textFile(
    ["feat: add a thing", "# zorblax in a git comment", scissors, "+ zorblax in the diff"].join(
      "\n",
    ),
  );

  expect(run("sh", [commitMessageHook, naming], madeUpTerm).status).toBe(1);
  expect(run("sh", [commitMessageHook, strippedOnly], madeUpTerm).status).toBe(0);
});

test("a repository scan reports names and lines, and survives symlinks and unstaged deletions", () => {
  const repository = temporaryDirectory();
  execFileSync("git", ["init", "-q"], { cwd: repository });
  writeFileSync(join(repository, "zorblax.md"), "plain\n");
  writeFileSync(join(repository, "notes.txt"), "plain\nmade like zorblax\n");
  writeFileSync(join(repository, "gone.txt"), "zorblax\n");
  mkdirSync(join(repository, "folder"));
  symlinkSync("folder", join(repository, "link"));
  execFileSync("git", ["add", "."], { cwd: repository });
  rmSync(join(repository, "gone.txt"));

  const result = check([], madeUpTerm, repository);

  expect(result.status).toBe(1);
  expect(result.stderr).toContain("zorblax.md: its name");
  expect(result.stderr).toContain("notes.txt:2:");
  expect(result.stderr).not.toContain("gone.txt");
  expect(check([], "nothing-here-at-all", repository).status).toBe(0);
});

test("an unknown option stops the check, with or without the variable", () => {
  const path = textFile("plain");

  expect(check(["--messages", path], madeUpTerm).status).toBe(2);
  expect(check(["--text"], undefined).status).toBe(2);
});

test("without the variable the check says it skipped and passes", () => {
  const result = check(["--text", textFile(madeUpTerm)], undefined);

  expect(result.status).toBe(0);
  expect(result.stderr).toContain("SOLIX_PRIVATE_TERMS is not set");
});
