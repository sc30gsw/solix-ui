#!/usr/bin/env node
import { execFileSync, spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { stripVTControlCharacters } from "node:util";

const scripts = dirname(fileURLToPath(import.meta.url));
const root = execFileSync("git", ["rev-parse", "--show-toplevel"], { cwd: scripts, encoding: "utf8" }).trim();
const repositoryModule = (path) => import(pathToFileURL(join(root, path)).href);
const { engineNames, enginesToVerify } = await repositoryModule("scripts/browser-engines.mjs");
const { evidenceDirectory, evidenceReports, fullReportFile, recordingFile, runDirectory, summaryFile } =
  await repositoryModule("scripts/evidence-summary.mjs");
const { stopWith } = await repositoryModule("scripts/stop-process.mjs");
const { installedVersions, listed } = await repositoryModule("scripts/repository.ts");
const { solidPackages } = await repositoryModule("scripts/newest-releases.ts");
const vp = join(root, "node_modules/.bin/vp");
const output = join(root, evidenceDirectory);

const journeys = [
  ["button-default", "A library button with its default style"],
  ["consumer-override", "A consumer's plain class overrides the library"],
  ["token-theme", "A consumer rethemes a subtree through a token"],
  ["changing-props", "A class and an attribute that change after the first render"],
  ["disclosure", "A disclosure opens and closes"],
  ["text-input", "A text input shows its border, its disabled look and its error after the user leaves it"],
  ["modal", "A modal opens over the page and closes by Escape, its Close button and a press outside"],
  ["box", "A Box takes style props, and a consumer's class and style still win"],
  ["styles-api", "Classes, styles and unstyled restyle a component's parts, and Button takes a style prop"],
  ["space", "A Space keeps the height and width it is given, at each breakpoint"],
  ["center", "A Center puts its content in its middle, inline or not"],
  ["stack", "A Stack lays its children out in a column"],
  ["group", "A Group lays its children out in a row, and grows them into equal shares"],
  ["flex", "A Flex sets the flexbox properties it is given, responsive ones at md"],
  ["container", "A Container limits its width, or not when fluid, and lays out a breakout grid"],
  ["simple-grid", "A SimpleGrid takes its columns from its breakpoints or its container's width"],
  ["grid", "A Grid gives each column the share of its row that span names"],
  ["server-render", "The page is server-rendered and styled without JavaScript"],
];

function mustPass(label, command, args) {
  const result = spawnSync(command, args, { cwd: root, encoding: "utf8", maxBuffer: Infinity });
  if (result.status !== 0) {
    const cause = result.error ? `${result.error.message}\n` : "";
    stopWith(`${result.stdout}${result.stderr}\n${cause}${label} failed. No evidence was recorded.\n`);
  }
  return result.stdout;
}

function installedVersion(from, name) {
  return JSON.parse(readFileSync(join(root, from, "node_modules", name, "package.json"), "utf8")).version;
}

mustPass("vp check", vp, ["check", "--deny-warnings"]);
mustPass("solid2-kit", vp, ["run", "lint:solid"]);
const testOutput = mustPass("vp test", vp, ["test"]);
const testSummary = stripVTControlCharacters(testOutput)
  .split("\n")
  .filter((line) => /^\s*(Test Files|Tests)\s/.test(line))
  .map((line) => line.trim().replace(/\s+/g, " "))
  .join("; ");

const drivenEngines = enginesToVerify();
const failed = [];
mustPass("launch", join(scripts, "launch.sh"), []);
try {
  mustPass("doctor", join(scripts, "doctor.sh"), []);
  for (const engine of drivenEngines) {
    for (const [journey] of journeys) {
      const run = spawnSync(join(scripts, "drive.mjs"), [journey, engine], { cwd: root, stdio: "inherit" });
      if (run.status !== 0) failed.push(`${journey} on ${engine}`);
    }
  }
} finally {
  spawnSync(join(scripts, "cleanup.sh"), [], { cwd: root, stdio: "inherit" });
}
if (failed.length > 0) {
  stopWith(`Journeys failed: ${failed.join(", ")}. No evidence was recorded.\n`);
}

rmSync(output, { recursive: true, force: true });
const runs = join(root, ".verify-playground/evidence");

function recordedRun(engine, journey) {
  const newest = readdirSync(join(runs, engine)).filter((name) => name.startsWith(`${journey}-2`)).sort().at(-1);
  const from = join(runs, engine, newest);
  const to = join(output, runDirectory(engine, journey));
  mkdirSync(to, { recursive: true });
  const record = JSON.parse(readFileSync(join(from, "observations.json"), "utf8"));
  for (const { image } of record.steps) copyFileSync(join(from, image), join(to, image));
  execFileSync("ffmpeg", [
    "-y", "-loglevel", "error", "-i", join(from, "recording.webm"),
    "-vf", "fps=6,scale=640:-1:flags=lanczos", join(to, recordingFile),
  ]);
  return record;
}

const recordedJourneys = journeys.map(([journey, title]) => ({
  journey,
  title,
  runs: Object.fromEntries(drivenEngines.map((engine) => [engine, recordedRun(engine, journey)])),
}));
const browserVersions = new Map(
  drivenEngines.map((engine) => [engine, recordedJourneys[0].runs[engine].browserVersion]),
);
const browserEngines = engineNames
  .map((engine) => `${engine} ${browserVersions.get(engine) ?? "not installed on the machine that recorded this"}`)
  .join("<br>");

const commit = execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
const uncommitted = execFileSync("git", ["status", "--porcelain"], { cwd: root, encoding: "utf8" }).trim();
const recordedFrom = uncommitted === "" ? `\`${commit}\`` : `\`${commit}\` with uncommitted changes`;

const installedSolid = installedVersions(solidPackages);
const solidVersions = solidPackages
  .map((name) => {
    const versions = [
      ...new Set(installedSolid.filter((each) => each.name === name).map(({ version }) => version)),
    ];
    return `${name} ${versions.length === 0 ? "not installed" : listed(versions)}`;
  })
  .join(", ");
const lib = "packages/core";
const { fullReport, summary } = evidenceReports({
  facts: [
    ["Recorded", `${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC`],
    ["Source", recordedFrom],
    ["Solid", solidVersions],
    ["StyleX", `@stylexjs/stylex ${installedVersion(lib, "@stylexjs/stylex")}`],
    ["Vite+", `vite-plus ${installedVersion(".", "vite-plus")}`],
    ["Browser engines", browserEngines],
    ["Checks", `\`vp check\`, \`solid2-kit check\` and \`vp test\` passed (${testSummary})`],
  ],
  engines: drivenEngines,
  journeys: recordedJourneys,
  upstreamExceptions: JSON.parse(
    readFileSync(join(root, "apps/playground/tests/upstream-diagnostic-exceptions.json"), "utf8"),
  ),
});
writeFileSync(join(output, fullReportFile), fullReport);
writeFileSync(join(output, summaryFile), summary);
console.log(`evidence recorded in ${output}: ${fullReportFile} in full, ${summaryFile} for the pull request comment`);
