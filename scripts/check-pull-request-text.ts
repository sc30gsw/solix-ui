import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { tmpdir } from "node:os";
import { changedLinesOf, commitsBetween, filesOf, gitRun } from "#/scripts/git.ts";
import {
  type PullRequestChanges,
  type PullRequestText,
  problemsOf,
} from "#/scripts/pull-request-text.ts";

const privateTermsCheck = join(import.meta.dirname, "check-private-terms.mjs");
const privateTermsVariable = "SOLIX_PRIVATE_TERMS";
const usage =
  "usage: check-pull-request-text.ts <pull_request event JSON file>\n       check-pull-request-text.ts --file <title on line 1, a blank line 2, the body from line 3> --base <base branch>";

type Source = { kind: "event"; fromFork: boolean } | { kind: "file" };
type PullRequest = PullRequestText & {
  source: Source;
  baseBranch: string | undefined;
  head: string | undefined;
};
type Reading = { pullRequest: PullRequest; problems: string[] };

function fieldAt(value: unknown, ...path: string[]): unknown {
  return path.reduce<unknown>(
    (at, key) => (typeof at === "object" && at !== null ? Reflect.get(at, key) : undefined),
    value,
  );
}

function textAt(value: unknown, ...path: string[]): string | undefined {
  const found = fieldAt(value, ...path);
  return typeof found === "string" && found !== "" ? found : undefined;
}

function commitOf(revision: string): string | undefined {
  return (
    gitRun(["rev-parse", "--verify", "--quiet", `${revision}^{commit}`]).stdout.trim() || undefined
  );
}

function readEvent(eventFile: string): Reading {
  const pullRequest = fieldAt(JSON.parse(readFileSync(eventFile, "utf8")), "pull_request");
  if (typeof pullRequest !== "object" || pullRequest === null) {
    throw new Error(
      `${eventFile}: the event holds no pull_request. Run this on a pull_request event.`,
    );
  }
  const head = textAt(pullRequest, "head", "sha");
  const baseBranch = textAt(pullRequest, "base", "ref");
  return {
    pullRequest: {
      title: textAt(pullRequest, "title") ?? "",
      body: textAt(pullRequest, "body") ?? "",
      source: {
        kind: "event",
        fromFork:
          fieldAt(pullRequest, "head", "repo", "full_name") !==
          fieldAt(pullRequest, "base", "repo", "full_name"),
      },
      baseBranch,
      head,
    },
    problems: [],
  };
}

function readFile(file: string, baseBranch: string): Reading {
  const [title = "", second = "", ...body] = readFileSync(file, "utf8").split("\n");
  const head = commitOf("HEAD");
  return {
    pullRequest: { title, body: body.join("\n"), source: { kind: "file" }, baseBranch, head },
    problems:
      second.trim() === ""
        ? []
        : [
            `${file}: line 2 is "${second}". Leave it blank, with the title on line 1 and the body from line 3.`,
          ],
  };
}

type ChangesReading = { changes: PullRequestChanges } | { cannotRead: string };

function cannotRead(why: string, remedy?: string): ChangesReading {
  return {
    cannotRead: `${why}, so the changes cannot be read.${remedy === undefined ? "" : ` ${remedy}`}`,
  };
}

function changesOf({ baseBranch, head }: PullRequest): ChangesReading {
  if (head === undefined) return cannotRead("There is no head commit to read");
  if (baseBranch === undefined) return cannotRead("The event names no base branch");
  const remote = `refs/remotes/origin/${baseBranch}`;
  const base = commitOf(remote);
  if (base === undefined) {
    return cannotRead(
      `The base branch "${baseBranch}" has no ${remote} in this clone`,
      "Fetch it, or check out the whole history with fetch-depth: 0.",
    );
  }
  const diff = gitRun(["diff", "--name-only", "--no-renames", "-z", `${base}...${head}`]);
  if (diff.status !== 0) return cannotRead(`git cannot compare ${remote} with ${head}`);
  const commits = commitsBetween(base, head).map(({ sha, parents, files }) => ({
    sha,
    parents,
    files,
    linesOf: (file: string) => changedLinesOf(sha, file),
  }));
  return { changes: { files: filesOf(diff.stdout), commits } };
}

function privateTermProblems({ title, body, source }: PullRequest): string[] {
  if ((process.env[privateTermsVariable] ?? "").trim() === "") {
    if (source.kind === "file" || source.fromFork) {
      console.log(
        `The private terms were not checked: ${privateTermsVariable} is not set${source.kind === "event" ? ", and GitHub gives it to no pull request from a fork" : ""}. Check the title and the body before merging.`,
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

function readArguments(): Reading | undefined {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    strict: false,
    options: { file: { type: "string" }, base: { type: "string" } },
  });
  const { file, base, ...unknown } = values;
  if (Object.keys(unknown).length > 0) return undefined;
  if (typeof file === "string" && typeof base === "string" && positionals.length === 0) {
    return readFile(file, base);
  }
  return file === undefined && base === undefined && positionals.length === 1
    ? readEvent(positionals[0])
    : undefined;
}

const reading = readArguments();
if (reading === undefined) {
  console.error(usage);
  process.exit(2);
}
const { pullRequest } = reading;
const read = changesOf(pullRequest);
const problems = [
  ...reading.problems,
  ...("cannotRead" in read ? [read.cannotRead] : []),
  ...problemsOf(pullRequest, "changes" in read ? read.changes : undefined),
  ...privateTermProblems(pullRequest),
];
for (const problem of problems) console.error(problem);
process.exit(problems.length === 0 ? 0 : 1);
