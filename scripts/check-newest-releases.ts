import { gitRun, pathsIn } from "#/scripts/git.ts";
import {
  compareWithNewest,
  failureLines,
  pinsOf,
  reportTable,
  verdictOf,
  warningLines,
} from "#/scripts/newest-releases.ts";
import { pnpmSettings } from "#/scripts/pnpm-settings.ts";
import {
  heldBackEntries,
  releasePolicy,
  releaseSources,
  untilStableMembers,
} from "#/scripts/release-sources.ts";
import { rootManifest } from "#/scripts/repository.ts";

const settings = pnpmSettings();
const pins = pinsOf(rootManifest(), settings.catalog);
const { comparisons, problems } = compareWithNewest({
  pins,
  ...(await releaseSources(
    pins.flatMap((pin) => (pin.source === "registry" ? [pin.registryName] : [])),
  )),
  policy: releasePolicy(settings),
  now: Date.now(),
  heldBack: heldBackEntries(),
  untilStablePackages: untilStableMembers(settings.catalog),
});

function filesOfThePullRequest(base: string): string[] | undefined {
  const run = gitRun([
    "diff",
    "--name-only",
    "--no-renames",
    "-z",
    `refs/remotes/origin/${base}...HEAD`,
  ]);
  if (run.status === 0) return pathsIn(run.stdout);
  console.error(
    `git diff against origin/${base} failed, so the check treats this pull request as changing the pins:\n${(run.stderr ?? "").trim()}`,
  );
  return undefined;
}

const pullRequestBase =
  process.env.GITHUB_EVENT_NAME === "pull_request" ? process.env.GITHUB_BASE_REF : undefined;
console.log(reportTable(comparisons));
const { failures, warnings } = verdictOf(
  problems,
  pullRequestBase ? filesOfThePullRequest(pullRequestBase) : undefined,
);
if (pullRequestBase) for (const line of warningLines(warnings, pullRequestBase)) console.log(line);
if (failures.length > 0) {
  console.error(failureLines(failures, process.env).join("\n"));
  process.exitCode = 1;
}
