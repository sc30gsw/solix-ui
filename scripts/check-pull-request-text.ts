import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  type PullRequestChanges,
  type PullRequestText,
  problemsOf,
} from "#/scripts/pull-request-text.ts";

const privateTermsCheck = join(import.meta.dirname, "check-private-terms.mjs");
const privateTermsVariable = "SOLIX_PRIVATE_TERMS";
const usage =
  "usage: check-pull-request-text.ts <pull_request event JSON file>\n       check-pull-request-text.ts --file <title on line 1, body from line 3> --base <commit>";

type Event = PullRequestText & {
  fromFork: boolean;
  draft: boolean;
  base: string | undefined;
  head: string | undefined;
};

function git(args: readonly string[]): { status: number | null; stdout: string } {
  return spawnSync("git", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
}

function filesOf(output: string): string[] {
  return output.split("\0").filter((path) => path.length > 0);
}

function isAncestor(commit: string, of: string): boolean {
  return git(["merge-base", "--is-ancestor", commit, of]).status === 0;
}

function changesBetween(base: string, head: string): PullRequestChanges | string {
  const diff = git(["diff", "--name-only", "-z", `${base}...${head}`]);
  if (diff.status !== 0) {
    return `git cannot compare ${base} with ${head}. Check out the whole history, with fetch-depth: 0.`;
  }
  return {
    files: filesOf(diff.stdout),
    changedSince: (given) => {
      const commit = git(["rev-parse", "--verify", "--quiet", `${given}^{commit}`]).stdout.trim();
      if (commit === "" || !isAncestor(commit, head) || isAncestor(commit, base)) return undefined;
      return filesOf(git(["diff", "--name-only", "-z", commit, head]).stdout);
    },
  };
}

function shaOf(pullRequest: object, side: "head" | "base"): string | undefined {
  const branch: unknown = Reflect.get(pullRequest, side);
  const sha: unknown =
    typeof branch === "object" && branch !== null ? Reflect.get(branch, "sha") : undefined;
  return typeof sha === "string" ? sha : undefined;
}

function repositoryOf(pullRequest: object, side: "head" | "base"): unknown {
  const branch: unknown = Reflect.get(pullRequest, side);
  const repository: unknown =
    typeof branch === "object" && branch !== null ? Reflect.get(branch, "repo") : undefined;
  return typeof repository === "object" && repository !== null
    ? Reflect.get(repository, "full_name")
    : undefined;
}

function pullRequestIn(eventFile: string): Event {
  const event: unknown = JSON.parse(readFileSync(eventFile, "utf8"));
  const pullRequest: unknown =
    typeof event === "object" && event !== null ? Reflect.get(event, "pull_request") : undefined;
  if (typeof pullRequest !== "object" || pullRequest === null) {
    throw new Error(
      `${eventFile}: the event holds no pull_request. Run this on a pull_request event.`,
    );
  }
  const title: unknown = Reflect.get(pullRequest, "title");
  const body: unknown = Reflect.get(pullRequest, "body");
  return {
    title: typeof title === "string" ? title : "",
    body: typeof body === "string" ? body : "",
    fromFork: repositoryOf(pullRequest, "head") !== repositoryOf(pullRequest, "base"),
    draft: Reflect.get(pullRequest, "draft") === true,
    base: shaOf(pullRequest, "base"),
    head: shaOf(pullRequest, "head"),
  };
}

function pullRequestInFile(file: string, base: string): Event {
  const [title = "", , ...body] = readFileSync(file, "utf8").split("\n");
  return { title, body: body.join("\n"), fromFork: false, draft: false, base, head: "HEAD" };
}

function textProblems(pullRequest: Event): string[] {
  if (pullRequest.draft) {
    console.log(
      "The pull request is a draft, so only its private terms are checked. The rest is checked when it is marked ready for review.",
    );
    return [];
  }
  if (pullRequest.base === undefined || pullRequest.head === undefined) {
    return ["The event names no base or head commit, so the changed files cannot be read."];
  }
  const changes = changesBetween(pullRequest.base, pullRequest.head);
  return typeof changes === "string" ? [changes] : problemsOf(pullRequest, changes);
}

function privateTermProblems({ title, body, fromFork }: Event): string[] {
  if ((process.env[privateTermsVariable] ?? "").trim() === "") {
    if (fromFork) {
      console.log(
        `The private terms were not checked: GitHub gives ${privateTermsVariable} to no pull request from a fork. Check the title and the body before merging.`,
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

const [first, ...rest] = process.argv.slice(2);
const fileMode = first === "--file" && rest.length === 3 && rest[1] === "--base";
if (
  first === undefined ||
  (first.startsWith("--") && !fileMode) ||
  (!fileMode && rest.length > 0)
) {
  console.error(usage);
  process.exit(2);
}
const pullRequest = fileMode ? pullRequestInFile(rest[0], rest[2]) : pullRequestIn(first);
const problems = [...textProblems(pullRequest), ...privateTermProblems(pullRequest)];
for (const problem of problems) console.error(problem);
process.exit(problems.length === 0 ? 0 : 1);
