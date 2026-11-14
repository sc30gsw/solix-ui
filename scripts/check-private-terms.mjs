#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { lstatSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { lineNumbersNamingATerm, parseTerms, privateTermsVariable } from "./private-terms.mjs";

const repositoryRoot = execFileSync("git", ["rev-parse", "--show-toplevel"], {
  encoding: "utf8",
}).trim();
const filesWhoseHashesLookLikeWords = new Set(["pnpm-lock.yaml"]);
const commentLine = /^#/;
const nulByte = "\0";

function trackedFiles() {
  return execFileSync("git", ["ls-files", "-z"], { cwd: repositoryRoot, encoding: "utf8" })
    .split(nulByte)
    .filter((path) => path.length > 0);
}

function findingsInRepository(terms) {
  return trackedFiles().flatMap((path) => {
    const inName = lineNumbersNamingATerm(path, terms).length > 0 ? [`${path}: the file name`] : [];
    const file = join(repositoryRoot, path);
    if (filesWhoseHashesLookLikeWords.has(path) || !lstatSync(file).isFile()) return inName;
    const text = readFileSync(file, "utf8");
    if (text.includes(nulByte)) return inName;
    return [...inName, ...lineNumbersNamingATerm(text, terms).map((line) => `${path}:${line}`)];
  });
}

function findingsInText(path, terms, { skipComments }) {
  const lines = readFileSync(path, "utf8")
    .split("\n")
    .map((line) => (skipComments && commentLine.test(line) ? "" : line));
  return lineNumbersNamingATerm(lines.join("\n"), terms).map((line) => `${path}:${line}`);
}

const terms = parseTerms(process.env[privateTermsVariable]);
if (terms.length === 0) {
  console.error(`private-term check skipped: ${privateTermsVariable} is not set.`);
  process.exit(0);
}

const [mode, path] = process.argv.slice(2);
const findings =
  mode === "--message"
    ? findingsInText(path, terms, { skipComments: true })
    : mode === "--text"
      ? findingsInText(path, terms, { skipComments: false })
      : findingsInRepository(terms);

for (const finding of findings) console.error(`${finding}: names a private term. Remove it.`);
process.exit(findings.length === 0 ? 0 : 1);
