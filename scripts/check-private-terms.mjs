#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { lstatSync, readFileSync } from "node:fs";
import { join } from "node:path";

const privateTermsVariable = "SOLIX_PRIVATE_TERMS";
const termSeparator = /[,\n]/;
const filesWhoseHashesLookLikeWords = new Set(["pnpm-lock.yaml"]);
const verboseCommitScissors = / -{24} >8 -{24}/;
const nulByte = "\0";
const usage = "usage: check-private-terms.mjs [--message <commit message file> | --text <file>]";

function git(args, input) {
  return execFileSync("git", args, { encoding: "utf8", input });
}

function parseTerms(value) {
  return (value ?? "")
    .split(termSeparator)
    .map((term) => term.trim().toLowerCase())
    .filter((term) => term.length > 0);
}

function lineNumbersNamingATerm(text, terms) {
  return text
    .split("\n")
    .map((line, index) => ({ line: line.toLowerCase(), number: index + 1 }))
    .filter(({ line }) => terms.some((term) => line.includes(term)))
    .map(({ number }) => number);
}

function messageAsGitStoresIt(text) {
  const lines = text.split("\n");
  const scissorsAt = lines.findIndex((line) => verboseCommitScissors.test(line));
  const beforeScissors = scissorsAt === -1 ? lines : lines.slice(0, scissorsAt);
  return git(["stripspace", "--strip-comments"], beforeScissors.join("\n"));
}

function findingsInRepository(terms) {
  const root = git(["rev-parse", "--show-toplevel"]).trim();
  return git(["-C", root, "ls-files", "-z"])
    .split(nulByte)
    .filter((path) => path.length > 0)
    .flatMap((path) => {
      const inName = lineNumbersNamingATerm(path, terms).length > 0 ? [`${path}: its name`] : [];
      const file = join(root, path);
      const isReadable = lstatSync(file, { throwIfNoEntry: false })?.isFile() ?? false;
      if (!isReadable || filesWhoseHashesLookLikeWords.has(path)) return inName;
      const text = readFileSync(file, "utf8");
      if (text.includes(nulByte)) return inName;
      return [...inName, ...lineNumbersNamingATerm(text, terms).map((line) => `${path}:${line}`)];
    });
}

const textModes = {
  "--message": (path, terms) =>
    lineNumbersNamingATerm(messageAsGitStoresIt(readFileSync(path, "utf8")), terms).length > 0
      ? [`${path}: the commit message`]
      : [],
  "--text": (path, terms) =>
    lineNumbersNamingATerm(readFileSync(path, "utf8"), terms).map((line) => `${path}:${line}`),
};

const [mode, path, ...extra] = process.argv.slice(2);
if (
  mode !== undefined &&
  (!Object.hasOwn(textModes, mode) || path === undefined || extra.length > 0)
) {
  console.error(usage);
  process.exit(2);
}

const terms = parseTerms(process.env[privateTermsVariable]);
if (terms.length === 0) {
  console.error(`private-term check skipped: ${privateTermsVariable} is not set.`);
  process.exit(0);
}

const findings = mode === undefined ? findingsInRepository(terms) : textModes[mode](path, terms);
for (const finding of findings) console.error(`${finding}: names a private term. Remove it.`);
process.exit(findings.length === 0 ? 0 : 1);
