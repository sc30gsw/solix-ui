import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { commitsBetween, filesOf, gitRun } from "#/scripts/git.ts";
import {
  type PullRequestChanges,
  type PullRequestText,
  problemsOf,
} from "#/scripts/pull-request-text.ts";

const privateTermsCheck = join(import.meta.dirname, "check-private-terms.mjs");
const privateTermsVariable = "SOLIX_PRIVATE_TERMS";
const usage =
  "usage: check-pull-request-text.ts <pull_request event JSON file>\n       check-pull-request-text.ts --file <title on line 1, a blank line 2, the body from line 3> --base <base branch>";

type PullRequest = PullRequestText & {
  local: boolean;
  fromFork: boolean;
  baseBranch: string;
  head: string;
  layout: string[];
};

function fieldAt(value: unknown, ...path: string[]): unknown {
  return path.reduce<unknown>(
    (at, key) => (typeof at === "object" && at !== null ? Reflect.get(at, key) : undefined),
    value,
  );
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function pullRequestIn(eventFile: string): PullRequest {
  const pullRequest = fieldAt(JSON.parse(readFileSync(eventFile, "utf8")), "pull_request");
  if (typeof pullRequest !== "object" || pullRequest === null) {
    throw new Error(
      `${eventFile}: the event holds no pull_request. Run this on a pull_request event.`,
    );
  }
  return {
    title: text(fieldAt(pullRequest, "title")),
    body: text(fieldAt(pullRequest, "body")),
    local: false,
    fromFork:
      fieldAt(pullRequest, "head", "repo", "full_name") !==
      fieldAt(pullRequest, "base", "repo", "full_name"),
    baseBranch: text(fieldAt(pullRequest, "base", "ref")),
    head: text(fieldAt(pullRequest, "head", "sha")),
    layout: [],
  };
}

function pullRequestInFile(file: string, baseBranch: string): PullRequest {
  const [title = "", second = "", ...body] = readFileSync(file, "utf8").split("\n");
  return {
    title,
    body: body.join("\n"),
    local: true,
    fromFork: false,
    baseBranch,
    head: "HEAD",
    layout:
      second.trim() === ""
        ? []
        : [
            `${file}: line 2 is "${second}". Leave it blank, with the title on line 1 and the body from line 3.`,
          ],
  };
}

function baseTip(branch: string): string | undefined {
  return [`refs/remotes/origin/${branch}`, `refs/heads/${branch}`, branch]
    .map((ref) => gitRun(["rev-parse", "--verify", "--quiet", `${ref}^{commit}`]).stdout.trim())
    .find((sha) => sha !== "");
}

function changesOf({ baseBranch, head }: PullRequest): PullRequestChanges | string {
  if (head === "") return "The event names no head commit, so the changed files cannot be read.";
  const base = baseTip(baseBranch);
  if (base === undefined) {
    return `The base branch "${baseBranch}" is not in this clone. Check out the whole history, with fetch-depth: 0.`;
  }
  const diff = gitRun(["diff", "--name-only", "--no-renames", "-z", `${base}...${head}`]);
  if (diff.status !== 0) return `git cannot compare ${baseBranch} with ${head}.`;
  return { files: filesOf(diff.stdout), commits: commitsBetween(base, head) };
}

function textProblems(pullRequest: PullRequest): string[] {
  const changes = changesOf(pullRequest);
  return [
    ...pullRequest.layout,
    ...(typeof changes === "string" ? [changes] : problemsOf(pullRequest, changes)),
  ];
}

function privateTermProblems({ title, body, fromFork, local }: PullRequest): string[] {
  if ((process.env[privateTermsVariable] ?? "").trim() === "") {
    if (fromFork || local) {
      console.log(
        `The private terms were not checked: ${privateTermsVariable} is not set${fromFork ? ", and GitHub gives it to no pull request from a fork" : ""}. Check the title and the body before merging.`,
      );
      return [];
    }
    return [
      `${privateTermsVariable} is not set, so the private terms were not checked. CI gives it to every pull request from this repository; run the check where it is set.`,
    ];
  }
  const directory = mkdtempSync(join(tmpdir(), "pull-request-text-"));
  const file = join(directory, "pull-request.md");
  try {
    writeFileSync(file, `${title}\n\n${body}`);
    const run = spawnSync(process.execPath, [privateTermsCheck, "--text", file], {
      encoding: "utf8",
    });
    return run.status === 0
      ? []
      : [
          `The title or the body names a private term:\n${run.stderr.replaceAll(file, "pull request")}`,
        ];
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function pullRequestFromArguments(): PullRequest | undefined {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    strict: false,
    options: { file: { type: "string" }, base: { type: "string" } },
  });
  const { file, base, ...unknown } = values;
  if (Object.keys(unknown).length > 0) return undefined;
  if (typeof file === "string" && typeof base === "string" && positionals.length === 0) {
    return pullRequestInFile(file, base);
  }
  return file === undefined && base === undefined && positionals.length === 1
    ? pullRequestIn(positionals[0])
    : undefined;
}

const pullRequest = pullRequestFromArguments();
if (pullRequest === undefined) {
  console.error(usage);
  process.exit(2);
}
const problems = [...textProblems(pullRequest), ...privateTermProblems(pullRequest)];
for (const problem of problems) console.error(problem);
process.exit(problems.length === 0 ? 0 : 1);
