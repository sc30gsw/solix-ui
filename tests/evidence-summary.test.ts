import { expect, test } from "vite-plus/test";
import { engineNames } from "../scripts/browser-engines.mjs";
import {
  commentSizeLimit,
  evidenceComment,
  evidenceReports,
  headingAnchors,
} from "../scripts/evidence-summary.mjs";

const journeysThePlaygroundMayReach = 200;
const titleLengthAboveTodaysMean = 70;
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

const renderedByGitHub = [
  ["# Verification evidence", "verification-evidence"],
  ["## How this was verified", "how-this-was-verified"],
  ["## A library button with its default style", "a-library-button-with-its-default-style"],
  ["### chromium 153.0.8010.12", "chromium-1530801012"],
  ["### firefox 155.0", "firefox-1550"],
  [
    "## A consumer's plain class overrides the library",
    "a-consumers-plain-class-overrides-the-library",
  ],
  ["### chromium 153.0.8010.12", "chromium-1530801012-1"],
  ["### firefox 155.0", "firefox-1550-1"],
  [
    "## A text input shows its border, its disabled look and its error after the user leaves it",
    "a-text-input-shows-its-border-its-disabled-look-and-its-error-after-the-user-leaves-it",
  ],
  [
    "## The page is server-rendered and styled without JavaScript",
    "the-page-is-server-rendered-and-styled-without-javascript",
  ],
  ["## How to get to it (user POV)", "how-to-get-to-it-user-pov"],
  ["## Driving it with drive.mjs", "driving-it-with-drivemjs"],
];

function observation(index: number, pass = true) {
  return {
    what: `observation ${index}: the part's computed background once the user has pressed it`,
    expected: "oklch(0.55 0.2 25)",
    actual: pass ? "oklch(0.55 0.2 25)" : "oklch(0.6 0.1 250)",
    pass,
  };
}

function journey(index: number, title?: string) {
  const name = `component-${String(index).padStart(3, "0")}-journey`;
  return {
    journey: name,
    title:
      title ??
      `Component ${index} shows its default look and follows the user's actions`.padEnd(
        titleLengthAboveTodaysMean,
        ".",
      ),
    runs: Object.fromEntries(
      engineNames.map((engine) => [
        engine,
        {
          browserVersion: "153.0.8010.12",
          steps: [{ description: "Open the page.", image: "01-page.png" }],
          observations: Array.from({ length: observationsPerRun }, (_, at) => observation(at)),
        },
      ]),
    ),
  };
}

function reportsFor(journeys: ReturnType<typeof journey>[]) {
  return evidenceReports({ facts, engines: engineNames, journeys, upstreamExceptions: [] });
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

test("the evidence comment fits in one pull request comment with 200 journeys on every engine", () => {
  const { summary } = reportsFor(
    Array.from({ length: journeysThePlaygroundMayReach }, (_, index) => journey(index)),
  );

  expect(
    postedComment(summary).length,
    "The comment grows with each journey. Keep each journey to one row with one link and a count per engine, and leave steps, screenshots, recordings and observed values to the full report.",
  ).toBeLessThan(commentSizeLimit);
});

test("a journey's cell names each observation that failed in that engine and counts the others", () => {
  const [failing] = engineNames;
  const withAFailure = journey(1, "A journey with a failure");
  withAFailure.runs[failing].observations[2] = observation(2, false);
  const { summary } = reportsFor([withAFailure]);

  expect(summary).toContain(
    `| [A journey with a failure](README.md#a-journey-with-a-failure) | FAIL: ${observation(2).what} | ${observationsPerRun} of ${observationsPerRun} |`,
  );
});

test("each anchor is the one GitHub renders for its heading, numbering a repeated heading", () => {
  const markdown = renderedByGitHub.map(([heading]) => heading).join("\n\n");

  expect(headingAnchors(markdown).map(({ anchor }) => anchor)).toEqual(
    renderedByGitHub.map(([, anchor]) => anchor),
  );
});

test("each journey row links to the heading of that journey's section in the full report, at the evidence commit in the comment", () => {
  const titles = ["How this was verified", "A Box, styled", "A box styled"];
  const { fullReport, summary } = reportsFor(titles.map((title, index) => journey(index, title)));
  const journeyHeadings = headingAnchors(fullReport)
    .filter(({ level }) => level === 2)
    .slice(-titles.length);
  const linked = journeyHeadings.map(({ text, anchor }, index) => {
    expect(text).toBe(titles[index]);
    expect(summary).toContain(`[${text}](README.md#${anchor})`);
    return anchor;
  });

  expect(linked).toEqual(["how-this-was-verified-1", "a-box-styled", "a-box-styled-1"]);
  expect(postedComment(summary)).toContain(
    `[A box styled](https://github.com/sc30gsw/solix-ui/blob/${fullLengthCommit}/docs/verification/README.md#a-box-styled-1)`,
  );
});
