import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vite-plus/test";
import { repositoryRoot } from "#/tests/support/workspace.ts";
import { gitInScratchRepository } from "#/tests/support/git.ts";

const script = join(repositoryRoot, "scripts/check-private-terms.mjs");
const commitMessageHook = join(repositoryRoot, ".vite-hooks/commit-msg");
const madeUpTerm = "zorblax";
const otherMadeUpTerm = "quindle widgets";
const scissors = "# ------------------------ >8 ------------------------";
function environment(terms: string | undefined): NodeJS.ProcessEnv {
  const inherited = Object.entries(process.env).filter(([name]) => name !== "SOLIX_PRIVATE_TERMS");
  return {
    ...Object.fromEntries(inherited),
    ...(terms === undefined ? {} : { SOLIX_PRIVATE_TERMS: terms }),
  };
}

function temporaryDirectory(): string {
  return mkdtempSync(join(tmpdir(), "private-terms-"));
}

function textFile(content: string): string {
  const path = join(temporaryDirectory(), "text.md");
  writeFileSync(path, content);
  return path;
}

function run(command: string, args: string[], terms: string | undefined, cwd = repositoryRoot) {
  return spawnSync(command, args, { cwd, env: environment(terms), encoding: "utf8" });
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

test("the commit-msg hook rejects a term anywhere above the scissors line, comment lines included", () => {
  const inBody = textFile(["feat: add a thing", "", "Built like zorblax."].join("\n"));
  const onHashLine = textFile(["feat: add a thing", "#42 zorblax"].join("\n"));
  const belowScissors = textFile(
    ["feat: add a thing", scissors, "- zorblax in the diff"].join("\n"),
  );

  expect(run("sh", [commitMessageHook, inBody], madeUpTerm).status).toBe(1);
  expect(run("sh", [commitMessageHook, onHashLine], madeUpTerm).status).toBe(1);
  expect(run("sh", [commitMessageHook, belowScissors], madeUpTerm).status).toBe(0);
});

test("a repository scan reads what is staged, file names and commit messages, and masks the term", () => {
  const repository = temporaryDirectory();
  gitInScratchRepository(repository, ["init", "-q"]);
  writeFileSync(join(repository, "plain.txt"), "plain\n");
  gitInScratchRepository(repository, ["add", "."]);
  gitInScratchRepository(repository, ["commit", "-q", "-m", "start", "-m", "made like zorblax"]);
  writeFileSync(join(repository, "zorblax.md"), "plain\n");
  writeFileSync(join(repository, "notes.txt"), "plain\nmade like zorblax\n");
  gitInScratchRepository(repository, ["add", "."]);
  rmSync(join(repository, "notes.txt"));

  const result = check([], madeUpTerm, repository);

  expect(result.status).toBe(1);
  expect(result.stderr).toContain("***.md: its name");
  expect(result.stderr).toContain("notes.txt:2:");
  expect(result.stderr).toMatch(/commit [0-9a-f]+: its message/);
  expect(result.stderr.toLowerCase()).not.toContain(madeUpTerm);
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
