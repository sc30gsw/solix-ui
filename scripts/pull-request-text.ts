export type PullRequestText = { title: string; body: string };

export const sectionOrder = [
  "Why",
  "What changed",
  "Scope",
  "Tradeoffs",
  "Blast Radius",
  "Verification",
] as const;
export const requiredSection = "Scope";
export const footer = "🤖 Generated with [Claude Code](https://claude.com/claude-code)";

const conventionalTitle =
  /^(build|chore|ci|docs|feat|fix|perf|refactor|revert|style|test)(\([^()\s][^()]*\))?!?: \S/;
const sessionUrl = /^https:\/\/claude\.ai\/code\/session_[A-Za-z0-9]+$/;
const secondLevelHeading = /^## (.*?)\s*$/gm;
const fence = /^\s*(```|~~~)/;

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

function outsideFencedCode(body: string): string {
  let fenced = false;
  return body
    .split("\n")
    .filter((line) => {
      if (fence.test(line)) fenced = !fenced;
      return !fenced && !fence.test(line);
    })
    .join("\n");
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
        `The body has its sections in the order ${known.join(", ")}. Put them in the order ${sectionOrder.join(", ")}, dropping any but ${requiredSection} that has nothing to say.`,
      ]
    : [];
  const missing = known.includes(requiredSection)
    ? []
    : [`The body has no "## ${requiredSection}" section. Every pull request says what it covers.`];
  return [...missing, ...unknown, ...repeated, ...outOfOrder];
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

export function problemsOf({ title, body }: PullRequestText): string[] {
  const text = body.replaceAll("\r\n", "\n");
  return [...titleProblems(title.trim()), ...sectionProblems(text), ...footerProblems(text)];
}
