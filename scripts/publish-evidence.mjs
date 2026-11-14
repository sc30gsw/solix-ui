import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  commentSizeLimit,
  evidenceComment,
  evidenceDirectory,
  evidenceMarker,
  summaryFile,
} from "./evidence-summary.mjs";

const root = join(import.meta.dirname, "..");

function fromTheEvidenceJob(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set. This script runs in the CI evidence job.`);
  return value;
}

const repository = fromTheEvidenceJob("GITHUB_REPOSITORY");
const pullRequest = fromTheEvidenceJob("PULL_REQUEST");
const headCommit = fromTheEvidenceJob("HEAD_COMMIT");
const evidenceRef = `refs/evidence/pull-${pullRequest}`;
const marker = evidenceMarker(headCommit);
const bot = "github-actions[bot]";
const botEmail = "41898282+github-actions[bot]@users.noreply.github.com";

function git(args, environment = {}) {
  return execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, ...environment },
  }).trim();
}

function gh(args) {
  return execFileSync("gh", args, { cwd: root, encoding: "utf8" });
}

function alreadyPosted() {
  const bodies = gh([
    "api",
    `repos/${repository}/issues/${pullRequest}/comments`,
    "--paginate",
    "--jq",
    ".[].body",
  ]);
  return bodies.includes(marker);
}

function earlierEvidenceCommits() {
  const listed = git(["ls-remote", "origin", evidenceRef]);
  if (listed === "") return [];
  git(["fetch", "--quiet", "origin", evidenceRef]);
  return [listed.split(/\s+/)[0]];
}

function commitEvidenceOutsideEveryBranch() {
  const temporaryIndex = {
    GIT_INDEX_FILE: join(mkdtempSync(join(tmpdir(), "evidence-")), "index"),
  };
  git(["add", "--force", evidenceDirectory], temporaryIndex);
  const tree = git(["write-tree"], temporaryIndex);
  const parents = earlierEvidenceCommits().flatMap((commit) => ["-p", commit]);
  return git(["commit-tree", tree, ...parents, "-m", `Verification evidence for ${headCommit}`], {
    GIT_AUTHOR_NAME: bot,
    GIT_AUTHOR_EMAIL: botEmail,
    GIT_COMMITTER_NAME: bot,
    GIT_COMMITTER_EMAIL: botEmail,
  });
}

function commentLinkingTo(evidenceCommit) {
  const comment = evidenceComment({
    summary: readFileSync(join(root, evidenceDirectory, summaryFile), "utf8"),
    repository,
    evidenceCommit,
    evidenceRef,
    headCommit,
  });
  if (comment.length > commentSizeLimit) {
    throw new Error(
      `The evidence report is ${comment.length} characters and a pull request comment holds ${commentSizeLimit}. Shorten the report in evidence.mjs.`,
    );
  }
  return comment;
}

if (alreadyPosted()) {
  console.log(`Evidence for ${headCommit} is already on pull request ${pullRequest}.`);
} else {
  const evidenceCommit = commitEvidenceOutsideEveryBranch();
  const commentFile = join(mkdtempSync(join(tmpdir(), "evidence-comment-")), "comment.md");
  writeFileSync(commentFile, commentLinkingTo(evidenceCommit));
  git(["push", "--quiet", "origin", `${evidenceCommit}:${evidenceRef}`]);
  gh(["pr", "comment", pullRequest, "--repo", repository, "--body-file", commentFile]);
  console.log(
    `Posted evidence ${evidenceCommit} for ${headCommit} to pull request ${pullRequest}.`,
  );
}
