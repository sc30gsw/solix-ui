import { matchesGlob } from "node:path";
import { isFormalVerificationFile, isModelFile } from "#/scripts/formal-verification.ts";

export type PullRequestText = { title: string; body: string };
export type PullRequestChanges = {
  files: readonly string[];
  changedSince: (commit: string) => readonly string[] | undefined;
};

export const sectionOrder = [
  "Why",
  "What changed",
  "Scope",
  "Tradeoffs",
  "Blast Radius",
  "Verification",
] as const;
export const requiredSections = ["Scope", "Verification"] as const;
export const lineLimit = 40;
export const reviewLines = {
  "comment-sicko": "- comment-sicko: clean at ",
  Thermos: "- Thermos: no Medium or higher at ",
} as const;
export const filesAfterReview = ".agents/skills/verify-*/SKILL.md";
export const footer = "🤖 Generated with [Claude Code](https://claude.com/claude-code)";

const conventionalTitle =
  /^(build|chore|ci|docs|feat|fix|perf|refactor|revert|style|test)(\([^()\s][^()]*\))?!?: \S/;
const sessionUrl = /^https:\/\/claude\.ai\/code\/session_[A-Za-z0-9]+$/;
const secondLevelHeading = /^## (.*?)\s*$/gm;
const fence = /^\s*(```|~~~)/;
const mermaidFence = /^\s*```mermaid\s*$/;
const commitAtStart = /^([0-9a-f]{7,40})\b/;

function knownSection(heading: string): heading is (typeof sectionOrder)[number] {
  return sectionOrder.some((section) => section === heading);
}

function titleProblems(title: string): string[] {
  return conventionalTitle.test(title)
    ? []
    : [
        `The title "${title}" is not a Conventional Commit. Write it as type(scope): subject, with a type such as feat, fix, docs, test, build, ci or refactor.`,
      ];
}

function linesOutside(body: string, dropped: (opening: string) => boolean): string[] {
  let opening: string | undefined;
  return body.split("\n").filter((line) => {
    const fenceLine = fence.test(line);
    const inside = opening ?? (fenceLine ? line : undefined);
    if (fenceLine) opening = opening === undefined ? line : undefined;
    return inside === undefined || !dropped(inside);
  });
}

function outsideFencedCode(body: string): string {
  return linesOutside(body, () => true).join("\n");
}

function sectionProblems(body: string): string[] {
  const headings = [...outsideFencedCode(body).matchAll(secondLevelHeading)].map(
    ([, heading]) => heading,
  );
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

function lengthProblems(body: string): string[] {
  const counted = linesOutside(body.trimEnd(), (opening) => mermaidFence.test(opening)).length;
  return counted < lineLimit
    ? []
    : [
        `The body has ${counted} lines outside its mermaid charts. Keep it a one-minute briefing under ${lineLimit} lines, and keep the history of each review round in the docs repository.`,
      ];
}

function sectionText(body: string, section: string): string[] {
  const lines = outsideFencedCode(body).split("\n");
  const start = lines.indexOf(`## ${section}`);
  if (start === -1) return [];
  const end = lines.findIndex((line, index) => index > start && line.startsWith("## "));
  return lines.slice(start + 1, end === -1 ? undefined : end);
}

function reviewProblems(body: string, changes: PullRequestChanges | undefined): string[] {
  const verification = sectionText(body, "Verification");
  return Object.entries(reviewLines).flatMap(([review, prefix]) => {
    const line = verification.find((each) => each.startsWith(prefix));
    const commit = commitAtStart.exec(line?.slice(prefix.length) ?? "")?.[1];
    if (commit === undefined) {
      return [
        `## Verification has no line "${prefix}<commit>". Run ${review} until it passes, then name the commit it reviewed.`,
      ];
    }
    if (changes === undefined) return [];
    const after = changes.changedSince(commit);
    if (after === undefined) {
      return [
        `The ${review} line names ${commit}, which is not a commit of this pull request. Name the commit it reviewed.`,
      ];
    }
    const unreviewed = after.filter((file) => !matchesGlob(file, filesAfterReview));
    return unreviewed.length === 0
      ? []
      : [
          `The ${review} line names ${commit}, but the pull request changes ${unreviewed.join(", ")} after it. Run ${review} again on the new commits and name the last one.`,
        ];
  });
}

function chartProblems(body: string, changes: PullRequestChanges | undefined): string[] {
  const formal = (changes?.files ?? []).filter(isFormalVerificationFile);
  if (formal.length === 0) return [];
  const charted = body.split("\n").some((line) => mermaidFence.test(line));
  const unnamed = formal.filter(isModelFile).filter((file) => !body.includes(`\`${file}\``));
  return [
    ...(charted
      ? []
      : [
          `The pull request changes ${formal.join(", ")} but its body has no \`\`\`mermaid chart. Check each model with pstack statechart and put its chart in ## Verification.`,
        ]),
    ...unnamed.map(
      (file) =>
        `The pull request changes the model ${file} but its body does not name it. Name it in backticks beside its chart.`,
    ),
  ];
}

function footerProblems(body: string): string[] {
  const lines = body
    .trimEnd()
    .split("\n")
    .filter((line) => line.trim() !== "");
  const [beforeLast, last] = lines.slice(-2).map((line) => line.trim());
  return beforeLast === footer && sessionUrl.test(last ?? "")
    ? []
    : [
        `The body does not end with the line "${footer}" followed by the session URL, https://claude.ai/code/session_<id>.`,
      ];
}

export function problemsOf(
  { title, body }: PullRequestText,
  changes?: PullRequestChanges,
): string[] {
  const text = body.replaceAll("\r\n", "\n");
  return [
    ...titleProblems(title.trim()),
    ...sectionProblems(text),
    ...lengthProblems(text),
    ...reviewProblems(text, changes),
    ...chartProblems(text, changes),
    ...footerProblems(text),
  ];
}
