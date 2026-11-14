#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const privateTermsVariable = "SOLIX_PRIVATE_TERMS";
const termSeparator = /[,\n]/;
const filesWhoseHashesLookLikeWords = ["pnpm-lock.yaml"];
const verboseCommitScissors = / -{24} >8 -{24}/;
const nulByte = "\0";
const mask = "***";
const usage = "usage: check-private-terms.mjs [--message <commit message file> | --text <file>]";

function git(args) {
  return execFileSync("git", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
}

function gitAllowingNoMatch(args) {
  try {
    return git(args);
  } catch (error) {
    if (error.status === 1) return "";
    throw error;
  }
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

function masked(path, terms) {
  return terms.reduce(
    (current, term) =>
      current.replace(new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), mask),
    path,
  );
}

function messageBeforeScissors(text) {
  const lines = text.split("\n");
  const scissorsAt = lines.findIndex((line) => verboseCommitScissors.test(line));
  return (scissorsAt === -1 ? lines : lines.slice(0, scissorsAt)).join("\n");
}

function findingsInStagedFiles(terms) {
  const output = gitAllowingNoMatch([
    "grep",
    "--cached",
    "-I",
    "-i",
    "-n",
    "-z",
    "-F",
    ...terms.flatMap((term) => ["-e", term]),
    "--",
    ".",
    ...filesWhoseHashesLookLikeWords.map((file) => `:!${file}`),
  ]);
  return output
    .split("\n")
    .filter((record) => record.length > 0)
    .map((record) => {
      const [path, line] = record.split(nulByte);
      return `${masked(path, terms)}:${line}`;
    });
}

function findingsInFileNames(terms) {
  return git(["ls-files", "-z"])
    .split(nulByte)
    .filter((path) => lineNumbersNamingATerm(path, terms).length > 0)
    .map((path) => `${masked(path, terms)}: its name`);
}

function findingsInCommitMessages(terms) {
  const hasCommits = gitAllowingNoMatch(["rev-parse", "--verify", "-q", "HEAD"]).length > 0;
  if (!hasCommits) return [];
  return git(["log", "-z", "--format=%h%n%B"])
    .split(nulByte)
    .filter((record) => record.trim().length > 0)
    .filter(
      (record) => lineNumbersNamingATerm(record.slice(record.indexOf("\n") + 1), terms).length > 0,
    )
    .map((record) => `commit ${record.trim().split("\n")[0]}: its message`);
}

const textModes = {
  "--message": (path, terms) =>
    lineNumbersNamingATerm(messageBeforeScissors(readFileSync(path, "utf8")), terms).length > 0
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

const findings =
  mode === undefined
    ? [
        ...findingsInFileNames(terms),
        ...findingsInStagedFiles(terms),
        ...findingsInCommitMessages(terms),
      ]
    : textModes[mode](path, terms);
for (const finding of findings) console.error(`${finding}: names a private term. Remove it.`);
process.exit(findings.length === 0 ? 0 : 1);
