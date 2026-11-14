import { expect, test } from "vite-plus/test";
import { engineNames } from "../scripts/browser-engines.mjs";
import {
  commentSizeLimit,
  evidenceComment,
  evidenceSummary,
} from "../scripts/evidence-summary.mjs";

const journeysThePlaygroundWillHave = 100;
const observationsPerRun = 20;
const fullLengthCommit = "0123456789abcdef0123456789abcdef01234567";

const facts = [
  ["Recorded", "2026-11-14 15:22 UTC"],
  ["Source", "`0123456` with uncommitted changes"],
  ["Solid", "solid-js 2.0.0-rc.21, @solidjs/web 2.0.0-rc.21"],
  ["StyleX", "@stylexjs/stylex 0.19.2"],
  ["Vite+", "vite-plus 1.6.0"],
  ["Browser engines", engineNames.map((engine) => `${engine} 153.0.8010.12`).join("<br>")],
  [
    "Checks",
    "`vp check`, `solid2-kit check` and `vp test` passed (Test Files 99 passed (99); Tests 999 passed (999))",
  ],
];

function observation(index: number, pass = true) {
  return {
    what: `observation ${index}: the part's computed background once the user has pressed it`,
    expected: "oklch(0.55 0.2 25)",
    actual: pass ? "oklch(0.55 0.2 25)" : "oklch(0.6 0.1 250)",
    pass,
  };
}

function journey(index: number) {
  const name = `component-${String(index).padStart(3, "0")}-journey`;
  return {
    journey: name,
    title: `Component ${index} shows its default look, takes a consumer's override and follows the user`,
    runs: Object.fromEntries(
      engineNames.map((engine) => [
        engine,
        {
          recording: `${engine}/${name}/recording.gif`,
          observations: Array.from({ length: observationsPerRun }, (_, at) => observation(at)),
        },
      ]),
    ),
  };
}

function postedComment(summary: string): string {
  return evidenceComment({
    summary,
    repository: "sc30gsw/solix-ui",
    evidenceCommit: fullLengthCommit,
    evidenceRef: "refs/evidence/pull-1000",
    headCommit: fullLengthCommit,
  });
}

test("the evidence comment fits in one pull request comment with 100 journeys on every engine", () => {
  const summary = evidenceSummary({
    facts,
    engines: engineNames,
    journeys: Array.from({ length: journeysThePlaygroundWillHave }, (_, index) => journey(index)),
    upstreamExceptions: [],
  });

  expect(
    postedComment(summary).length,
    "The comment grows with each journey and engine. Keep each journey to one row of counts and recording links, and leave steps, screenshots and observed values to the full report.",
  ).toBeLessThan(commentSizeLimit);
});

test("a journey's cell names each observation that failed in that engine", () => {
  const [engine] = engineNames;
  const withAFailure = journey(1);
  withAFailure.runs[engine].observations[2] = observation(2, false);
  const summary = evidenceSummary({
    facts,
    engines: engineNames,
    journeys: [withAFailure],
    upstreamExceptions: [],
  });

  expect(summary).toContain(
    `[FAIL, ${observationsPerRun - 1} of ${observationsPerRun} passed](${engine}/component-001-journey/recording.gif). Failed: ${observation(2).what}`,
  );
  expect(summary).toContain(
    `[${observationsPerRun} of ${observationsPerRun} passed](${engineNames[1]}/component-001-journey/recording.gif)`,
  );
});
