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

function changedFilesOfThePullRequest(): string[] | undefined {
  const base = process.env.GITHUB_BASE_REF;
  if (process.env.GITHUB_EVENT_NAME !== "pull_request" || !base) return undefined;
  const run = gitRun(["diff", "--name-only", "-z", `refs/remotes/origin/${base}...HEAD`]);
  return run.status === 0 ? pathsIn(run.stdout) : undefined;
}

console.log(reportTable(comparisons));
const { failing, warned } = verdictOf(problems, process.env, changedFilesOfThePullRequest());
for (const line of warningLines(warned, process.env)) console.warn(line);
if (failing.length > 0) {
  console.error(failureLines(failing, process.env).join("\n"));
  process.exitCode = 1;
}
