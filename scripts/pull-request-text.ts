import { matchesGlob } from "node:path";
import { isFormalVerificationFile, isModelFile } from "#/scripts/formal-verification.ts";
import { verificationSkillPrefix } from "#/scripts/verification-skills.ts";
import type { ChangedLines } from "#/scripts/git.ts";
import { type FencedBlock, type Markdown, parseMarkdown } from "#/scripts/markdown.ts";

export type PullRequestText = { title: string; body: string };
export type PullRequestCommit = {
  sha: string;
  parents: readonly string[];
  files: readonly string[];
  linesOf: (file: string) => ChangedLines;
};
export type PullRequestChanges = {
  files: readonly string[];
  commits: readonly PullRequestCommit[];
};

export const sectionOrder = [
  "Why",
  "What changed",
  "Scope",
  "Tradeoffs",
  "Blast Radius",
  "Verification",
] as const;
const requiredSections = ["Scope", "Verification"] as const;
export const lineLimit = 40;
export const chartLineCap = 60;
export const chartLinesCap = 120;
export const reviewLines = {
  "comment-sicko": "- comment-sicko: clean at ",
  Thermos: "- Thermos: no Medium or higher at ",
  fallow: "- fallow: no error at ",
} as const;
const filesAfterReview = `.agents/skills/${verificationSkillPrefix}*/SKILL.md`;
export const footer = "🤖 Generated with [Claude Code](https://claude.com/claude-code)";

type SectionName = (typeof sectionOrder)[number];

const conventionalTitle =
  /^(build|chore|ci|docs|feat|fix|perf|refactor|revert|style|test)(\([^()\s][^()]*\))?!?: \S/;
const sessionUrl = /^https:\/\/claude\.ai\/code\/session_[A-Za-z0-9]+$/;
const writtenCommit = /^(`?)([0-9a-fA-F]{7,40})\1(?![0-9a-fA-F])/;
const confirmedLine = /Last confirmed against commit `[0-9a-f]{7,40}`/;
const confirmedCommits = /(Last confirmed against commit `|git diff )[0-9a-f]{7,40}\b/g;
const frontmatterFence = /^\s*---\s*$/;
const directive = /^\s*%%/;
const directiveStart = /^\s*%%\{/;
const directiveEnd = /\}%%\s*$/;
const diagramType =
  /^\s*(stateDiagram(-v2)?|flowchart|graph|sequenceDiagram|classDiagram|erDiagram|journey|gantt|pie|mindmap|timeline)\b/;

function knownSection(heading: string): heading is SectionName {
  return sectionOrder.some((section) => section === heading);
}

function titleProblems(title: string): string[] {
  return conventionalTitle.test(title)
    ? []
    : [
        `The title "${title}" is not a Conventional Commit. Write it as type(scope): subject, with a type such as feat, fix, docs, test, build, ci or refactor.`,
      ];
}

function sectionProblems({ sections }: Markdown): string[] {
  const headings = sections.filter(({ level }) => level === 2).map(({ heading }) => heading);
  const unknown = headings
    .filter((heading) => !knownSection(heading))
    .map(
      (heading) =>
        `The body has the section "## ${heading}", which is none of ${sectionOrder.map((section) => `## ${section}`).join(", ")}.`,
    );
  const known = headings.filter(knownSection);
  const repeated = known
    .filter((heading, index) => known.indexOf(heading) !== index)
    .map((heading) => `The body has "## ${heading}" more than once.`);
  const ranks = known.map((heading) => sectionOrder.indexOf(heading));
  const outOfOrder = ranks.some((rank, index) => index > 0 && rank < ranks[index - 1])
    ? [
        `The body has its sections in the order ${known.join(", ")}. Put them in the order ${sectionOrder.join(", ")}, dropping any but ${requiredSections.join(" and ")} that has nothing to say.`,
      ]
    : [];
  const missing = requiredSections
    .filter((section) => !known.includes(section))
    .map((section) => `The body has no "## ${section}" section. Every pull request has one.`);
  return [...missing, ...unknown, ...repeated, ...outOfOrder];
}

function diagramLine(lines: readonly string[]): string {
  let at = lines.findIndex((line) => line.trim() !== "");
  if (frontmatterFence.test(lines[at] ?? "")) {
    const end = lines.findIndex((line, index) => index > at && frontmatterFence.test(line));
    at = end === -1 ? lines.length : end + 1;
  }
  let inDirective = false;
  for (const line of lines.slice(at)) {
    if (inDirective || directiveStart.test(line)) {
      inDirective = !directiveEnd.test(line);
      continue;
    }
    if (line.trim() !== "" && !directive.test(line)) return line;
  }
  return "";
}

function isChart({ info, lines, closed }: FencedBlock): boolean {
  return closed && info === "mermaid" && diagramType.test(diagramLine(lines));
}

function lengthProblems({ blocks, lines }: Markdown): string[] {
  const uncounted = Math.min(
    blocks
      .filter(isChart)
      .reduce((sum, block) => sum + Math.min(block.lines.length + 2, chartLineCap), 0),
    chartLinesCap,
  );
  const counted = lines.length - uncounted;
  return counted < lineLimit
    ? []
    : [
        `The body has ${counted} lines, not counting up to ${chartLineCap} lines of each mermaid chart and ${chartLinesCap} of all of them. Keep it a one-minute briefing under ${lineLimit} lines, and keep the history of each review round in the coordinator's private notes.`,
      ];
}

function verificationOf({ sections }: Markdown) {
  return sections.find(({ level, heading }) => level === 2 && heading === "Verification");
}

function reachableFrom(sha: string, commits: readonly PullRequestCommit[]): Set<string> {
  const parentsOf = new Map(commits.map((commit) => [commit.sha, commit.parents]));
  const reached = new Set<string>();
  const pending = [sha];
  for (let next = pending.pop(); next !== undefined; next = pending.pop()) {
    if (reached.has(next)) continue;
    reached.add(next);
    pending.push(...(parentsOf.get(next) ?? []));
  }
  return reached;
}

function isSkillConfirmationFile(file: string): boolean {
  return matchesGlob(file, filesAfterReview);
}

function onlyMovesItsConfirmation({ removed, added }: ChangedLines): boolean {
  const same = (line: string) => line.replace(confirmedCommits, "$1<commit>");
  return (
    removed.length > 0 &&
    removed.length === added.length &&
    removed.every(
      (line, index) =>
        confirmedLine.test(line) &&
        confirmedLine.test(added[index] ?? "") &&
        same(line) === same(added[index] ?? ""),
    )
  );
}

function unreviewedFilesOf({ parents, files, linesOf }: PullRequestCommit): string[] {
  return files.filter((file) => {
    if (parents.length > 1 || !isSkillConfirmationFile(file)) return true;
    return !onlyMovesItsConfirmation(linesOf(file));
  });
}

function changedAfter(sha: string, { files, commits }: PullRequestChanges): string[] {
  const before = reachableFrom(sha, commits);
  const changed = commits
    .filter((commit) => !before.has(commit.sha))
    .flatMap(unreviewedFilesOf)
    .filter((file) => files.includes(file));
  return [...new Set(changed)];
}

function reviewProblems(markdown: Markdown, changes: PullRequestChanges | undefined): string[] {
  const prose = verificationOf(markdown)?.prose ?? [];
  return Object.entries(reviewLines).flatMap(([review, prefix]) => {
    const line = prose.find((each) => each.startsWith(prefix));
    if (line === undefined) {
      return [
        `## Verification has no line that starts "${prefix}". Run ${review} until it passes, then write that line with the commit it reviewed.`,
      ];
    }
    const rest = line.slice(prefix.length);
    const written = writtenCommit.exec(rest)?.[2];
    if (written === undefined) {
      return [
        `The ${review} line gives "${rest.split(/\s/)[0]}" where it needs the hash of the commit it reviewed, 7 to 40 hexadecimal digits.`,
      ];
    }
    if (changes === undefined) return [];
    const matches = changes.commits.filter(({ sha }) => sha.startsWith(written.toLowerCase()));
    if (matches.length === 0) {
      return [
        `The ${review} line names ${written}, which is not a commit of this pull request. Name the commit it reviewed.`,
      ];
    }
    if (matches.length > 1) {
      return [
        `The ${review} line names ${written}, which is the start of ${matches.length} commits of this pull request. Write more of its hash.`,
      ];
    }
    const after = changedAfter(matches[0].sha, changes);
    return after.length === 0
      ? []
      : [
          `The ${review} line names ${written}, but the pull request's own commits after it change ${after.join(", ")}, beyond moving a verification skill's Last confirmed commit. Run ${review} again on those commits and name the last one.`,
        ];
  });
}

function chartProblems(markdown: Markdown, changes: PullRequestChanges | undefined): string[] {
  const formal = (changes?.files ?? []).filter(isFormalVerificationFile);
  if (formal.length === 0) return [];
  const verification = verificationOf(markdown);
  const prose = verification?.prose.join("\n") ?? "";
  return [
    ...(verification?.blocks.some(isChart) === true
      ? []
      : [
          `The pull request changes ${formal.join(", ")}, but ## Verification has no mermaid chart. Check each model and put its chart there, as the Statechart step of open-pull-request says.`,
        ]),
    ...formal
      .filter((file) => isModelFile(file) && !prose.includes(`\`${file}\``))
      .map(
        (file) =>
          `The pull request changes the model ${file}, but ## Verification does not name it in backticks beside its chart.`,
      ),
  ];
}

function footerProblems({ sections, lines }: Markdown): string[] {
  const [beforeLast, last] = (sections.at(-1)?.prose ?? [])
    .map((line) => line.trim())
    .filter((line) => line !== "")
    .slice(-2);
  const lastLine = lines.findLast((line) => line.trim() !== "")?.trim();
  return beforeLast === footer && sessionUrl.test(last ?? "") && lastLine === last
    ? []
    : [
        `The body does not end with the line "${footer}" followed by the session URL, https://claude.ai/code/session_<id>.`,
      ];
}

export function problemsOf(
  { title, body }: PullRequestText,
  changes: PullRequestChanges | undefined,
): string[] {
  const markdown = parseMarkdown(body.trimEnd());
  return [
    ...titleProblems(title.trim()),
    ...sectionProblems(markdown),
    ...lengthProblems(markdown),
    ...reviewProblems(markdown, changes),
    ...chartProblems(markdown, changes),
    ...footerProblems(markdown),
  ];
}
