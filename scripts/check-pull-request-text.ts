import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type PullRequestText, problemsOf } from "#/scripts/pull-request-text.ts";

const privateTermsCheck = join(import.meta.dirname, "check-private-terms.mjs");
const privateTermsVariable = "SOLIX_PRIVATE_TERMS";
const usage = "usage: check-pull-request-text.ts <pull_request event JSON file>";

type Event = PullRequestText & { fromFork: boolean };

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
  };
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

const eventFile = process.argv[2];
if (eventFile === undefined) {
  console.error(usage);
  process.exit(2);
}
const pullRequest = pullRequestIn(eventFile);
const problems = [...problemsOf(pullRequest), ...privateTermProblems(pullRequest)];
for (const problem of problems) console.error(problem);
process.exit(problems.length === 0 ? 0 : 1);
