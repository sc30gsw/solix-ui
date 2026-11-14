import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vite-plus/test";
import { linesNamingATerm, parseTerms, privateTermsVariable } from "../scripts/private-terms.mjs";
import { repositoryRoot } from "./support/workspace";

const script = join(repositoryRoot, "scripts/check-private-terms.mjs");
const madeUpTerm = "zorblax";
const otherMadeUpTerm = "quindle widgets";

function textFile(content: string): string {
  const path = join(mkdtempSync(join(tmpdir(), "private-terms-")), "text.md");
  writeFileSync(path, content);
  return path;
}

function check(args: string[], terms: string | undefined) {
  const env = { ...process.env };
  delete env[privateTermsVariable];
  if (terms !== undefined) env[privateTermsVariable] = terms;
  return spawnSync("node", [script, ...args], { cwd: repositoryRoot, env, encoding: "utf8" });
}

test("terms are read from a comma- or newline-separated value, trimmed and in lower case", () => {
  expect(parseTerms(` Zorblax ,quindle widgets\n\n,`)).toEqual([madeUpTerm, otherMadeUpTerm]);
  expect(parseTerms(undefined)).toEqual([]);
});

test("a line names a term whatever its case, and other lines do not", () => {
  const text = ["a plain line", "made with ZorBlax", "Quindle Widgets inside", "zorbla x"].join(
    "\n",
  );

  expect(linesNamingATerm(text, [madeUpTerm, otherMadeUpTerm])).toEqual([2, 3]);
});

test("the check names the file and line of each hit and never the term itself", () => {
  const path = textFile(["fine", "built like zorblax", "fine"].join("\n"));
  const result = check(["--text", path], `${madeUpTerm},${otherMadeUpTerm}`);

  expect(result.status).toBe(1);
  expect(result.stderr).toContain(`${path}:2`);
  expect(result.stderr.toLowerCase()).not.toContain(madeUpTerm);
});

test("a commit message ignores the comment lines git adds", () => {
  const path = textFile(["feat: add a thing", "# zorblax in a git comment"].join("\n"));

  expect(check(["--message", path], madeUpTerm).status).toBe(0);
  expect(check(["--text", path], madeUpTerm).status).toBe(1);
});

test("without the variable the check says it skipped and passes", () => {
  const result = check(["--text", textFile("zorblax")], undefined);

  expect(result.status).toBe(0);
  expect(result.stderr).toContain(`${privateTermsVariable} is not set`);
});

test("the repository scan reads every tracked file, and reports a term that is there", () => {
  expect(check([], randomUUID()).status).toBe(0);

  const known = check([], "verify-playground");
  expect(known.status).toBe(1);
  expect(known.stderr).toMatch(
    /\.agents\/skills\/verify-playground\/SKILL\.md:\d+: names a private term/,
  );
});
