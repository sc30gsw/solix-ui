import { spawnSync } from "node:child_process";
import { readFileSync, renameSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, matchesGlob } from "node:path";
import { describe, expect, test } from "vite-plus/test";
import { fixesWithoutATest, verificationFiles } from "#/scripts/fixes-carry-tests.ts";
import type { ChangedLines } from "#/scripts/git.ts";
import { parseMarkdown } from "#/scripts/markdown.ts";
import {
  chartLineCap,
  chartLinesCap,
  footer,
  lineLimit,
  type PullRequestChanges,
  type PullRequestCommit,
  problemsOf,
  reviewLines,
  sectionOrder,
} from "#/scripts/pull-request-text.ts";
import { gitInScratchRepository } from "#/tests/support/git.ts";
import { inTemporaryTree } from "#/tests/support/temporary-tree.ts";
import { repositoryRoot, trackedFiles } from "#/tests/support/workspace.ts";

const workflowFile = ".github/workflows/pull-request.yml";
const textCheck = join(repositoryRoot, "scripts/check-pull-request-text.ts");
const fixCheck = join(repositoryRoot, "scripts/check-fixes-carry-tests.ts");
const session = "https://claude.ai/code/session_01AbCdEf";
const title = "ci: check the text of every pull request";
const fakeTerm = "zorblax";
const reviewed = "0123abc";
const chart =
  "```mermaid\nstateDiagram-v2\n  [*] --> Closed\n  Closed --> Open: you press open\n```";

function reviewsAt(commit: string): string {
  return `${reviewLines["comment-sicko"]}${commit}.\n${reviewLines.Thermos}${commit}, after 2 rounds.\n`;
}

function bodyWith(
  sections: readonly string[],
  ending = `${footer}\n\n${session}\n`,
  commit = reviewed,
): string {
  const text = (section: string) =>
    section === "Verification" ? `Text.\n\n${reviewsAt(commit)}` : "Text.\n";
  return `${sections.map((section) => `## ${section}\n\n${text(section)}`).join("\n")}\n${ending}`;
}

const minimal = ["Scope", "Verification"] as const;

function inVerification(body: string, text: string): string {
  return body.replace("## Verification\n\n", `## Verification\n\n${text}\n`);
}

function shaOf(prefix: string): string {
  return prefix.padEnd(40, "0");
}

type Edit = { file: string } & ChangedLines;
type After = readonly string[] | { merge: readonly string[] } | Edit;

const noLines = () => ({ removed: [], added: [] });

function changesOf(
  files: readonly string[],
  after: readonly After[] = [],
  extra: readonly PullRequestCommit[] = [],
): PullRequestChanges {
  const commits: PullRequestCommit[] = [
    { sha: shaOf(reviewed), parents: [shaOf("b")], files: [...files], linesOf: noLines },
  ];
  for (const [index, changed] of after.entries()) {
    const sha = shaOf(`a${index}`);
    const parent = commits.at(-1)?.sha ?? "";
    if ("merge" in changed) {
      commits.push({ sha, parents: [parent, shaOf("c")], files: changed.merge, linesOf: noLines });
    } else if ("file" in changed) {
      commits.push({ sha, parents: [parent], files: [changed.file], linesOf: () => changed });
    } else {
      commits.push({ sha, parents: [parent], files: [...changed], linesOf: noLines });
    }
  }
  const touched = after.flatMap((each) =>
    "merge" in each ? each.merge : "file" in each ? [each.file] : each,
  );
  return { files: [...new Set([...files, ...touched])], commits: [...commits, ...extra] };
}

const unchanged = changesOf([]);

describe("the markdown of a body", () => {
  test("is read once into sections, fenced blocks of either fence and the prose outside them", () => {
    const parsed = parseMarkdown(
      "## Why \n\nText.\n\n~~~\n```mermaid\n## Scope\n```\n~~~\n\n## Verification\n\n````mermaid\nstateDiagram-v2\n```\n````\n- a\n",
    );

    expect(parsed.sections.map(({ level, heading }) => [level, heading])).toEqual([
      [2, "Why"],
      [2, "Verification"],
    ]);
    expect(parsed.blocks.map(({ fence, info, closed }) => [fence, info, closed])).toEqual([
      ["~~~", "", true],
      ["````", "mermaid", true],
    ]);
    expect(parsed.sections[1]?.prose).toEqual(["", "- a", ""]);
  });

  test("ends a section at a heading of level 1 or 2, and reads no text inside an HTML comment", () => {
    const parsed = parseMarkdown(
      "## Verification\n\n- a <!-- hidden -->\n<!--\n- b\n-->\n- c\n# Notes\n\n- d\n### Deeper\n",
    );

    expect(parsed.sections.map(({ level, heading }) => [level, heading])).toEqual([
      [2, "Verification"],
      [1, "Notes"],
    ]);
    expect(parsed.sections[0]?.prose).toEqual(["", "- a ", "- c"]);
    expect(parsed.sections[1]?.prose).toEqual(["", "- d", "### Deeper", ""]);
  });
});

describe("the text of a pull request", () => {
  test("reads no heading inside fenced code", () => {
    const body = bodyWith(sectionOrder).replace(
      "## Verification\n\nText.\n",
      "## Verification\n\n```md\n## Notes\n## Why\n```\n\n~~~\n## Scope\n~~~\n",
    );

    expect(problemsOf({ title, body }, unchanged)).toEqual([]);
  });

  test("passes with a Conventional title, its sections in order and the footer last, with any section but Scope and Verification dropped", () => {
    expect(problemsOf({ title, body: bodyWith(sectionOrder) }, unchanged)).toEqual([]);
    expect(problemsOf({ title: "fix(core)!: x", body: bodyWith(minimal) }, unchanged)).toEqual([]);
    expect(
      problemsOf({ title, body: bodyWith(sectionOrder).replaceAll("\n", "\r\n") }, unchanged),
    ).toEqual([]);
  });

  test("reads a heading with trailing spaces as the section it names", () => {
    const body = bodyWith(minimal).replace("## Verification\n", "## Verification  \n");

    expect(problemsOf({ title, body }, unchanged)).toEqual([]);
  });

  test.each([
    [
      "a title with no type",
      "Check the text of every pull request",
      "is not a Conventional Commit",
    ],
    [
      "a title with an unknown type",
      "feature: check pull requests",
      "is not a Conventional Commit",
    ],
    [
      "a title with no space after the colon",
      "ci:check pull requests",
      "is not a Conventional Commit",
    ],
  ])("fails %s", (_, badTitle, said) => {
    expect(
      problemsOf({ title: badTitle, body: bodyWith(sectionOrder) }, unchanged).join("\n"),
    ).toContain(said);
  });

  test.each([
    ["no Scope", bodyWith(["Why", "What changed", "Verification"]), 'has no "## Scope"'],
    ["no Verification", bodyWith(["Why", "Scope"]), 'has no "## Verification"'],
    ["Scope before Why", bodyWith(["Scope", "Why", "Verification"]), "in the order Scope, Why"],
    [
      "Verification before Tradeoffs",
      bodyWith(["Scope", "Verification", "Tradeoffs"]),
      "Put them in the order",
    ],
    ["a section of its own", bodyWith([...minimal, "Notes"]), 'the section "## Notes"'],
    ["a section twice", bodyWith(["Scope", ...minimal]), 'has "## Scope" more than once'],
    ["no footer", bodyWith(minimal, ""), "does not end with the line"],
    [
      "the footer without the session URL",
      bodyWith(minimal, `${footer}\n`),
      "does not end with the line",
    ],
    [
      "the session URL with no footer",
      bodyWith(minimal, `${session}\n`),
      "does not end with the line",
    ],
    [
      "the footer and then a link that is not a session URL",
      bodyWith(minimal, `${footer}\n\nhttps://claude.ai/code\n`),
      "does not end with the line",
    ],
    [
      "the session URL before the footer",
      bodyWith(minimal, `${session}\n\n${footer}\n`),
      "does not end with the line",
    ],
    [
      "text after the footer",
      bodyWith(minimal, `${footer}\n\n${session}\n\nMore.\n`),
      "does not end with the line",
    ],
  ])("fails a body with %s", (_, body, said) => {
    expect(problemsOf({ title, body }, unchanged).join("\n")).toContain(said);
  });

  test(`fails a body of ${lineLimit} lines or more, leaving out the lines of each closed mermaid chart up to ${chartLineCap}`, () => {
    const filler = (lines: number) => "Text.\n".repeat(lines);
    const spare = lineLimit - bodyWith(minimal).trimEnd().split("\n").length;
    const withScope = (text: string) =>
      bodyWith(minimal).replace("## Scope\n\nText.\n", `## Scope\n\n${text}`);
    const chartOf = (arrows: number, fence = "```") =>
      [
        `${fence}mermaid`,
        "stateDiagram-v2",
        ...Array.from({ length: arrows }, () => "  Open --> Closed: you press close"),
        fence,
      ].join("\n");
    const atLimit = withScope(filler(spare + 1));
    const underLimit = withScope(filler(spare));
    const counted = (body: string) =>
      problemsOf({ title, body }, unchanged).filter((problem) => problem.includes("lines"));

    expect(atLimit.trimEnd().split("\n").length).toBe(lineLimit);
    expect(counted(atLimit).join("\n")).toContain(`under ${lineLimit} lines`);
    expect(counted(underLimit)).toEqual([]);
    expect(counted(inVerification(underLimit, chartOf(30)))).toEqual([]);
    expect(counted(inVerification(underLimit, chartOf(30, "~~~")))).toEqual([]);
    expect(counted(inVerification(underLimit, chartOf(chartLineCap)))).toHaveLength(1);
    expect(counted(inVerification(underLimit, "```\na\n```"))).toHaveLength(1);
    expect(counted(inVerification(underLimit, "```mermaid\nnot a diagram\n```"))).toHaveLength(1);
    expect(
      counted(inVerification(underLimit, "~~~\n```mermaid\nstateDiagram-v2\n```\n~~~")),
    ).toHaveLength(1);
    expect(counted(`${underLimit}\n${"```mermaid\nstateDiagram-v2\n".repeat(1)}`)).toHaveLength(1);
    const fiveCharts = Array.from({ length: 5 }, () => chartOf(50)).join("\n");
    expect(counted(inVerification(underLimit, fiveCharts))).toHaveLength(1);
    const twoCharts = Array.from({ length: 2 }, () => chartOf(50)).join("\n");
    expect(counted(inVerification(underLimit, twoCharts))).toEqual([]);
    expect(chartLinesCap).toBeGreaterThanOrEqual(2 * 53);
    const withFrontmatter = chartOf(30).replace("mermaid\n", "mermaid\n---\ntitle: Tabs\n---\n");
    const withInit = chartOf(30).replace(
      "mermaid\n",
      "mermaid\n%%{init: {'theme': 'neutral'}}%%\n",
    );
    expect(counted(inVerification(underLimit, withFrontmatter))).toEqual([]);
    expect(counted(inVerification(underLimit, withInit))).toEqual([]);
    const withLongInit = chartOf(30).replace(
      "mermaid\n",
      "mermaid\n%%{\n  init: { 'theme': 'neutral' }\n}%%\n",
    );
    expect(counted(inVerification(underLimit, withLongInit))).toEqual([]);
  });

  test("reads the review lines after a comment marker written inside a code span", () => {
    const body = inVerification(bodyWith(minimal), "A comment opens with `<!--`.");

    expect(problemsOf({ title, body }, unchanged)).toEqual([]);
  });

  test.each([
    ["the comment-sicko line", reviewLines["comment-sicko"]],
    ["the Thermos line", reviewLines.Thermos],
  ])(
    "fails a Verification section without %s, or with a placeholder in place of the commit",
    (_, line) => {
      const without = bodyWith(minimal)
        .split("\n")
        .filter((each) => !each.startsWith(line))
        .join("\n");
      const pending = bodyWith(minimal).replace(`${line}${reviewed}`, `${line}PENDING`);
      const elsewhere = `## Why\n\n${line}${reviewed}.\n\n${without}`;

      for (const body of [without, elsewhere]) {
        expect(problemsOf({ title, body }, unchanged).join("\n")).toContain(
          `## Verification has no line that starts "${line}"`,
        );
      }
      expect(problemsOf({ title, body: pending }, unchanged).join("\n")).toContain(
        `gives "PENDING`,
      );
    },
  );

  test("reads a reviewed commit written in backticks or upper case", () => {
    for (const written of [`\`${reviewed}\``, reviewed.toUpperCase()]) {
      expect(problemsOf({ title, body: bodyWith(minimal, undefined, written) }, unchanged)).toEqual(
        [],
      );
    }
  });

  test("fails a review line that names no commit of the pull request, or a prefix that more than one commit has", () => {
    const twins = changesOf(
      [],
      [],
      [`${reviewed}1`, `${reviewed}2`].map((prefix) => ({
        sha: shaOf(prefix),
        parents: [shaOf("b")],
        files: [],
        linesOf: noLines,
      })),
    );

    expect(
      problemsOf({ title, body: bodyWith(minimal, undefined, "fedcba9") }, unchanged).join("\n"),
    ).toContain("names fedcba9, which is not a commit of this pull request");
    expect(problemsOf({ title, body: bodyWith(minimal) }, twins).join("\n")).toContain(
      "names 0123abc, which is the start of 3 commits of this pull request",
    );
  });

  test("fails a pull request whose own commits after the reviewed one change more than a verification skill's Last confirmed commit, a merge's own resolution included, and leaves out files the pull request does not change", () => {
    const body = bodyWith(minimal);
    const skill = ".agents/skills/verify-tabs/SKILL.md";
    const confirmed = (commit: string) =>
      `Last confirmed against commit \`${commit}\`. Run \`git diff ${commit} -- packages/core/src\` to see what changed since.`;
    const moved = { file: skill, removed: [confirmed("1111111")], added: [confirmed("2222222")] };
    const reworded = {
      file: skill,
      removed: [confirmed("1111111")],
      added: [confirmed("2222222").replace("what changed", "what moved")],
    };
    const prose = { file: skill, removed: ["Run it."], added: ["Run it twice."] };
    const nothing = { file: skill, removed: [], added: [] };
    const otherHash = {
      file: skill,
      removed: [`${confirmed("1111111")} See abcdef1.`],
      added: [`${confirmed("2222222")} See abcdef2.`],
    };
    const notInTheDiff = changesOf(["src/a.ts"], [["src/a.ts"]]);
    const after = (changes: PullRequestChanges) => problemsOf({ title, body }, changes);

    expect(after(changesOf(["src/a.ts"], [moved]))).toEqual([]);
    expect(after(changesOf(["src/a.ts"], [{ merge: [] }]))).toEqual([]);
    expect(after({ ...notInTheDiff, files: [] })).toEqual([]);
    for (const edit of [reworded, prose, nothing, otherHash, [skill]]) {
      expect(after(changesOf(["src/a.ts"], [edit])).join("\n")).toContain(
        `own commits after it change ${skill}`,
      );
    }
    expect(after(changesOf(["src/a.ts"], [{ merge: ["src/a.ts"] }])).join("\n")).toContain(
      "own commits after it change src/a.ts",
    );
    expect(after(changesOf(["src/a.ts"], [["src/a.ts", "AGENTS.md"]]))).toEqual([
      "The comment-sicko line names 0123abc, but the pull request's own commits after it change src/a.ts, AGENTS.md, beyond moving a verification skill's Last confirmed commit. Run comment-sicko again on those commits and name the last one.",
      "The Thermos line names 0123abc, but the pull request's own commits after it change src/a.ts, AGENTS.md, beyond moving a verification skill's Last confirmed commit. Run Thermos again on those commits and name the last one.",
    ]);
  });

  test("still runs every check of the text alone when git cannot read the changes", () => {
    const problems = problemsOf(
      { title: "no type", body: bodyWith(minimal, undefined, "PENDING") },
      undefined,
    ).join("\n");

    expect(problems).toContain("is not a Conventional Commit");
    expect(problems).toContain('gives "PENDING.');
  });

  test.each([
    ["inside an HTML comment", (line: string) => `<!--\n${line}\n-->`],
    ["under a level-1 heading after Verification", (line: string) => `# Notes\n\n${line}`],
  ])("reads no review line %s", (_, hide) => {
    const line = `${reviewLines["comment-sicko"]}${reviewed}.`;
    const body = bodyWith(minimal)
      .replace(line, "")
      .replace(`${footer}`, `${hide(line)}\n\n${footer}`);

    expect(problemsOf({ title, body }, unchanged).join("\n")).toContain(
      `## Verification has no line that starts "${reviewLines["comment-sicko"]}"`,
    );
  });

  test("fails a footer inside an HTML comment or an unclosed fence", () => {
    const commented = bodyWith(minimal)
      .replace(footer, `<!--\n${footer}`)
      .replace(session, `${session}\n-->`);
    const unclosed = bodyWith(minimal).replace(footer, `\`\`\`\n${footer}`);

    for (const body of [commented, unclosed]) {
      expect(problemsOf({ title, body }, unchanged).join("\n")).toContain(
        "does not end with the line",
      );
    }
  });

  test.each([
    [".agents/skills/verify-formal-tabs/SKILL.md", false],
    ["models/tabs.model.ts", true],
    ["models/Tabs.tla", true],
    ["models/Tabs.cfg", true],
  ])(
    "fails a pull request that changes %s with no mermaid chart in Verification, or without naming the model there",
    (file, isModel) => {
      const changes = changesOf([file]);
      const charted = inVerification(bodyWith(minimal), chart);
      const named = inVerification(charted, `\`${file}\`:`);
      const namedElsewhere = charted.replace("## Scope\n\nText.", `## Scope\n\n\`${file}\``);
      const chartElsewhere = bodyWith(minimal).replace("## Scope\n\nText.", `## Scope\n\n${chart}`);

      expect(problemsOf({ title, body: bodyWith(minimal) }, changes).join("\n")).toContain(
        "## Verification has no mermaid chart",
      );
      expect(problemsOf({ title, body: chartElsewhere }, changes).join("\n")).toContain(
        "## Verification has no mermaid chart",
      );
      const unnamed = `The pull request changes the model ${file}, but ## Verification does not name it in backticks beside its chart.`;
      expect(problemsOf({ title, body: charted }, changes)).toEqual(isModel ? [unnamed] : []);
      expect(problemsOf({ title, body: namedElsewhere }, changes)).toEqual(
        isModel ? [unnamed] : [],
      );
      expect(problemsOf({ title, body: named }, changes)).toEqual([]);
      expect(problemsOf({ title, body: bodyWith(minimal) }, changesOf(["models/tabs.ts"]))).toEqual(
        [],
      );
    },
  );
});

type Run = { status: number | null; stdout: string; stderr: string };

type ScratchPullRequest = {
  root: string;
  git: (...args: string[]) => string;
  base: string;
  head: string;
  commit: (file: string) => string;
  check: (pullRequest: object, head?: string, environment?: NodeJS.ProcessEnv) => Run;
};

const withTerms: NodeJS.ProcessEnv = { ...process.env, SOLIX_PRIVATE_TERMS: fakeTerm };

async function inScratchPullRequest(use: (repository: ScratchPullRequest) => void): Promise<void> {
  await inTemporaryTree({ "src/a.ts": "a\n" }, (root) => {
    const git = (...args: string[]) => gitInScratchRepository(root, args).trim();
    const commit = (file: string) => {
      mkdirSync(dirname(join(root, file)), { recursive: true });
      writeFileSync(join(root, file), `${file} ${git("rev-list", "--all", "--count")}\n`);
      git("add", "--all");
      git("commit", "--quiet", `--message=change ${file}`);
      return git("rev-parse", "HEAD");
    };
    git("init", "--quiet", "--initial-branch=main");
    git("add", ".");
    git("commit", "--quiet", "--message=base");
    const base = git("rev-parse", "HEAD");
    git("update-ref", "refs/remotes/origin/main", "main");
    git("switch", "--quiet", "--create", "topic");
    const head = commit("src/a.ts");
    const check = (pullRequest: object, to = head, environment = withTerms) => {
      const event = join(root, ".git", "event.json");
      writeFileSync(
        event,
        JSON.stringify({
          pull_request: { base: { sha: base, ref: "main" }, head: { sha: to }, ...pullRequest },
        }),
      );
      return spawnSync(process.execPath, [textCheck, event], {
        cwd: root,
        encoding: "utf8",
        env: environment,
      });
    };
    use({ root, git, base, head, commit, check });
  });
}

describe("the text check", () => {
  test("reads the pull_request event, and fails on a private term in the title or the body without printing it", async () => {
    await inScratchPullRequest(({ head, check }) => {
      const body = bodyWith(sectionOrder, undefined, head.slice(0, 7));
      const clean = check({ title, body });
      const named = check({ title, body: body.replace("Text.", `Like ${fakeTerm}.`) });
      const badTitle = check({ title: `ci: like ${fakeTerm}`, body });

      expect([clean.status, clean.stderr]).toEqual([0, ""]);
      for (const failed of [named, badTitle]) {
        expect(failed.status).toBe(1);
        expect(failed.stderr).toContain("names a private term");
        expect(failed.stderr).not.toContain(fakeTerm);
      }
    });
  });

  test("reads the pull request's own commits from git: a commit after the reviewed one fails, and a chart is asked for when a model changes", async () => {
    await inScratchPullRequest(({ base, head, commit, check }) => {
      const body = bodyWith(minimal, undefined, head);

      expect(check({ title, body }).status).toBe(0);
      const afterReview = check({ title, body }, commit("docs/notes.md"));
      expect(afterReview.status).toBe(1);
      expect(afterReview.stderr).toContain("own commits after it change docs/notes.md");
      const notInThePullRequest = check({ title, body: bodyWith(minimal, undefined, base) }, head);
      expect(notInThePullRequest.stderr).toContain("which is not a commit of this pull request");
      const model = commit("Tabs.tla");
      const uncharted = check({ title, body: bodyWith(minimal, undefined, model) }, model);
      expect(uncharted.stderr).toContain(
        "changes Tabs.tla, but ## Verification has no mermaid chart",
      );
    });
  });

  test("counts nothing that a merge from the base branch brings in after the review, read from the base branch's tip, not the event's base commit", async () => {
    await inScratchPullRequest(({ git, head, commit, check }) => {
      git("switch", "--quiet", "main");
      commit("src/main.ts");
      git("update-ref", "refs/remotes/origin/main", "main");
      git("switch", "--quiet", "topic");
      git("merge", "--quiet", "--no-ff", "--message=merge main", "main");
      const merged = git("rev-parse", "HEAD");

      expect(check({ title, body: bodyWith(minimal, undefined, head) }, merged).stderr).toBe("");
    });
  });

  test("counts what a merge after the review resolves on its own, and a verification skill's edit beyond its Last confirmed commit", async () => {
    await inScratchPullRequest(({ root, git, head, commit, check }) => {
      git("switch", "--quiet", "main");
      commit("src/main.ts");
      git("update-ref", "refs/remotes/origin/main", "main");
      git("switch", "--quiet", "topic");
      git("merge", "--quiet", "--no-ff", "--no-commit", "main");
      writeFileSync(join(root, "src/a.ts"), "unreviewed\n");
      git("add", "--all");
      git("commit", "--quiet", "--message=merge main");
      const evil = git("rev-parse", "HEAD");
      const skill = join(root, ".agents/skills/verify-tabs/SKILL.md");
      const body = bodyWith(minimal, undefined, head);

      expect(check({ title, body }, evil).stderr).toContain("own commits after it change src/a.ts");
      git("reset", "--quiet", "--hard", head);
      mkdirSync(dirname(skill), { recursive: true });
      writeFileSync(skill, "Last confirmed against commit `1111111`.\nRun it.\n");
      git("add", "--all");
      git("commit", "--quiet", "--message=add skill");
      const reviewedWithSkill = git("rev-parse", "HEAD");
      writeFileSync(skill, "Last confirmed against commit `2222222`.\nRun it.\n");
      git("commit", "--quiet", "--all", "--message=confirm");
      const confirmed = git("rev-parse", "HEAD");
      const withSkill = bodyWith(minimal, undefined, reviewedWithSkill);
      expect(check({ title, body: withSkill }, confirmed).stderr).toBe("");
      writeFileSync(skill, "Last confirmed against commit `2222222`.\nRun it twice.\n");
      git("commit", "--quiet", "--all", "--message=edit");
      expect(check({ title, body: withSkill }, git("rev-parse", "HEAD")).stderr).toContain(
        "own commits after it change .agents/skills/verify-tabs/SKILL.md",
      );
    });
  });

  test("counts a conflict that a merge after the review resolves with one side whole, and a skill's line edited after the review whatever it starts with", async () => {
    await inScratchPullRequest(({ root, git, head, check }) => {
      git("switch", "--quiet", "main");
      writeFileSync(join(root, "src/a.ts"), "from main\n");
      git("commit", "--quiet", "--all", "--message=main changes a");
      git("update-ref", "refs/remotes/origin/main", "main");
      git("switch", "--quiet", "topic");
      spawnSync("git", ["merge", "--no-ff", "--no-edit", "main"], { cwd: root });
      git("checkout", "--ours", "src/a.ts");
      git("add", "--all");
      git(
        "-c",
        "user.name=Test",
        "-c",
        "user.email=test@example.com",
        "commit",
        "--quiet",
        "--no-edit",
      );
      const body = bodyWith(minimal, undefined, head);

      expect(check({ title, body }, git("rev-parse", "HEAD")).stderr).toContain(
        "own commits after it change src/a.ts",
      );

      git("reset", "--quiet", "--hard", head);
      git("update-ref", "refs/remotes/origin/main", "main~1");
      const skill = join(root, ".agents/skills/verify-tabs/SKILL.md");
      mkdirSync(dirname(skill), { recursive: true });
      writeFileSync(skill, "---\nname: verify-tabs\n---\n--flag one\n");
      git("add", "--all");
      git("commit", "--quiet", "--message=add skill");
      const reviewedWithSkill = git("rev-parse", "HEAD");
      writeFileSync(skill, "---\nname: verify-tabs\n---\n--flag two\n");
      git("commit", "--quiet", "--all", "--message=edit a line that starts with --");
      expect(
        check(
          { title, body: bodyWith(minimal, undefined, reviewedWithSkill) },
          git("rev-parse", "HEAD"),
        ).stderr,
      ).toContain("own commits after it change .agents/skills/verify-tabs/SKILL.md");
    });
  });

  test("counts what an octopus merge after the review resolves on its own", async () => {
    await inScratchPullRequest(({ root, git, head, commit, check }) => {
      const body = bodyWith(minimal, undefined, head);
      for (const branch of ["one", "two"]) {
        git("switch", "--quiet", "--create", branch, head);
        commit(`src/${branch}.ts`);
      }
      git("switch", "--quiet", "topic");
      git("merge", "--quiet", "--no-ff", "--no-commit", "one", "two");
      writeFileSync(join(root, "src/a.ts"), "unreviewed in the octopus\n");
      git("add", "--all");
      git("commit", "--quiet", "--message=octopus");
      expect(check({ title, body }, git("rev-parse", "HEAD")).stderr).toContain(
        "own commits after it change src/a.ts",
      );
    });
  });

  test("reads a signed commit the same when the user's git shows signatures: its change after the review counts, and the fix check reads its subject", async () => {
    await inScratchPullRequest(({ root, git, base, head, check }) => {
      writeFileSync(join(root, "src/a.ts"), "changed in a signed commit\n");
      git("add", "--all");
      const commitObject = [
        `tree ${git("write-tree")}`,
        `parent ${head}`,
        "author Test <test@example.com> 1700000000 +0000",
        "committer Test <test@example.com> 1700000000 +0000",
        "gpgsig -----BEGIN SSH SIGNATURE-----",
        " U1NIU0lH",
        " -----END SSH SIGNATURE-----",
        "",
        "fix: a signed change",
        "",
      ].join("\n");
      const objectFile = join(root, ".git", "signed-commit.txt");
      writeFileSync(objectFile, commitObject);
      const signed = git("hash-object", "-t", "commit", "-w", objectFile);
      git("update-ref", "refs/heads/topic", signed);
      git("reset", "--quiet", "--hard");
      git("config", "log.showSignature", "true");
      expect(check({ title, body: bodyWith(minimal, undefined, head) }, signed).stderr).toContain(
        "own commits after it change src/a.ts",
      );
      const fixes = spawnSync(process.execPath, [fixCheck, base, signed], {
        cwd: root,
        encoding: "utf8",
      });
      expect([fixes.status, fixes.stderr]).toEqual([
        1,
        expect.stringContaining('"fix: a signed change" is a fix that changes no file'),
      ]);
    });
  });

  test("reads the base only from its remote-tracking branch, says so when it is missing, and still checks the text", async () => {
    await inScratchPullRequest(({ git, head, check }) => {
      git("tag", "release", "main");
      const run = check({
        title: "no type",
        body: bodyWith(minimal, undefined, head),
        base: { ref: "release" },
      });

      expect(run.stderr).toContain(
        'The base branch "release" has no refs/remotes/origin/release in this clone',
      );
      expect(run.stderr).toContain("is not a Conventional Commit");
      expect(check({ title, body: bodyWith(minimal, undefined, head), base: {} }).stderr).toContain(
        "The event names no base branch, so the changes cannot be read.",
      );
    });
  });

  test("counts a reviewed file renamed after the review into a verification skill", async () => {
    await inScratchPullRequest(({ root, git, head, check }) => {
      const skill = ".agents/skills/verify-tabs/SKILL.md";
      mkdirSync(dirname(join(root, skill)), { recursive: true });
      renameSync(join(root, "src/a.ts"), join(root, skill));
      git("add", "--all");
      git("commit", "--quiet", "--message=move");
      const moved = git("rev-parse", "HEAD");

      expect(check({ title, body: bodyWith(minimal, undefined, head) }, moved).stderr).toMatch(
        /own commits after it change \.agents\/skills\/verify-tabs\/SKILL\.md, src\/a\.ts,/,
      );
    });
  });

  test("checks a file with the title on line 1, a blank line 2 and the body from line 3 against HEAD, as it would the opened pull request", async () => {
    await inScratchPullRequest(({ root, head }) => {
      const file = join(root, ".git", "pull-request.md");
      const run = (text: string, args = ["--file", file, "--base", "main"], env = withTerms) => {
        writeFileSync(file, text);
        return spawnSync(process.execPath, [textCheck, ...args], {
          cwd: root,
          encoding: "utf8",
          env,
        });
      };
      const text = `${title}\n\n${bodyWith(minimal, undefined, head)}`;
      const withoutTerms: NodeJS.ProcessEnv = { ...process.env };
      delete withoutTerms.SOLIX_PRIVATE_TERMS;

      expect([run(text).status, run(text).stderr]).toEqual([0, ""]);
      expect(run(text.replace(head, "main")).stderr).toContain('gives "main."');
      const noBlank = run(text.replace("\n\n", "\nX\n"));
      expect([noBlank.status, noBlank.stderr]).toEqual([1, expect.stringContaining("line 2")]);
      const local = run(text, undefined, withoutTerms);
      expect([local.status, local.stdout]).toEqual([
        0,
        expect.stringContaining("were not checked"),
      ]);
      expect(run(text, ["--file", file]).status).toBe(2);
      expect(run(text, ["--base", "main"]).status).toBe(2);
    });
  });
});

describe("the text check where the private terms are not given", () => {
  const sameRepository = {
    head: { repo: { full_name: "owner/solix-ui" } },
    base: { repo: { full_name: "owner/solix-ui" } },
  };
  const fork = {
    head: { repo: { full_name: "someone/solix-ui" } },
    base: { repo: { full_name: "owner/solix-ui" } },
  };

  test.each([
    [
      "from this repository fails, since CI gives it the terms",
      sameRepository,
      1,
      "stderr",
      "is not set",
    ],
    [
      "from a fork passes and says the terms were not checked",
      fork,
      0,
      "stdout",
      "were not checked",
    ],
  ] as const)("a pull request %s", async (_, repositories, status, stream, said) => {
    await inScratchPullRequest(({ base, head, check }) => {
      const environment = { ...process.env };
      delete environment.SOLIX_PRIVATE_TERMS;
      const run = check(
        {
          title,
          body: bodyWith(sectionOrder, undefined, head),
          base: { ...repositories.base, sha: base, ref: "main" },
          head: { ...repositories.head, sha: head },
        },
        head,
        environment,
      );

      expect(run.status).toBe(status);
      expect(run[stream]).toContain(said);
    });
  });
});

describe("a fix carries its test", () => {
  test.each([
    ["fix: a", ["src/a.ts"], true],
    ["fix(core): a", ["packages/core/src/a.ts", "AGENTS.md"], true],
    ["fix(core)!: a", ["packages/core/src/a.ts"], true],
    ["fix: a", ["src/a.ts", "packages/core/tests/a.test.ts"], false],
    ["fix: a", ["apps/storybook/src/A.stories.tsx"], false],
    ["fix: a", ["tests/support/served-app.ts"], false],
    ["feat: a", ["src/a.ts"], false],
    ["docs: fix a typo", ["README.md"], false],
    ['Revert "fix: a"', ["src/a.ts"], false],
    ["fix(tests): a", ["scripts/expected-values.ts"], false],
    [
      "fix(tabs): a",
      ["packages/core/src/TabsTab.tsx", "apps/playground/tests/support/tabs.ts"],
      false,
    ],
  ])("%j changing %j is flagged: %s", (subject, files, flagged) => {
    expect(fixesWithoutATest([{ sha: "0123456789", subject, files }]).length > 0).toBe(flagged);
  });

  test("every pattern of verificationFiles matches a tracked file, so the list cannot hold a pattern that no longer means anything", () => {
    const tracked = trackedFiles();
    const unmatched = verificationFiles.filter(
      (pattern) => !tracked.some((file) => matchesGlob(file, pattern)),
    );

    expect(unmatched).toEqual([]);
  });

  test("the check says what git said when git cannot read a commit", async () => {
    await inTemporaryTree({ "src/a.ts": "a\n" }, (root) => {
      gitInScratchRepository(root, ["init", "--quiet", "--initial-branch=main"]);
      const run = spawnSync(process.execPath, [fixCheck, "no-such-base", "HEAD"], {
        cwd: root,
        encoding: "utf8",
      });

      expect(run.status).not.toBe(0);
      expect(run.stderr).toContain("no-such-base..HEAD failed with status 128:");
      expect(run.stderr).toMatch(/fatal: .*(no-such-base|revision)/);
    });
  });

  test("the check reads the commits a pull request adds, and passes over merge commits whatever their message", async () => {
    await inTemporaryTree({ "src/a.ts": "a\n" }, (root) => {
      const git = (...args: string[]) => gitInScratchRepository(root, args).trim();
      const commit = (file: string, subject: string) => {
        writeFileSync(join(root, file), `${subject}\n`);
        git("add", ".");
        git("commit", "--quiet", `--message=${subject}`);
      };
      git("init", "--quiet", "--initial-branch=main");
      git("add", ".");
      git("commit", "--quiet", "--message=base");
      const base = git("rev-parse", "HEAD");
      git("switch", "--quiet", "--create", "side");
      commit("side.ts", "feat: side");
      git("switch", "--quiet", "main");
      commit("src/b.test.ts", "fix: b, with its test");
      git("merge", "--quiet", "--no-ff", "--message=fix: merge the side branch", "side");
      const carried = git("rev-parse", "HEAD");
      commit("src/a.ts", "fix: a, with no test");
      const run = (head: string) =>
        spawnSync(process.execPath, [fixCheck, base, head], { cwd: root, encoding: "utf8" });

      expect([run(carried).status, run(carried).stderr]).toEqual([0, ""]);
      const flagged = run("HEAD");
      expect(flagged.status).toBe(1);
      expect(flagged.stderr).toContain(
        '"fix: a, with no test" is a fix that changes no file of verificationFiles',
      );
      expect(flagged.stderr).not.toContain("merge the side branch");
    });
  });
});

test("the pull request workflow runs both checks on every open, edit, push and reopening, in steps that only call the scripts", () => {
  const workflow = readFileSync(join(repositoryRoot, workflowFile), "utf8");

  expect(workflow).toContain(
    "  pull_request:\n    types: [opened, edited, synchronize, reopened]\n",
  );
  expect(workflow).toContain(
    '      - run: node scripts/check-pull-request-text.ts "$GITHUB_EVENT_PATH"\n        env:\n          SOLIX_PRIVATE_TERMS: ${{ secrets.SOLIX_PRIVATE_TERMS }}\n',
  );
  expect(workflow).toContain(
    '      - run: node scripts/check-fixes-carry-tests.ts "$PULL_REQUEST_BASE" "$PULL_REQUEST_HEAD"\n        env:\n          PULL_REQUEST_BASE: ${{ github.event.pull_request.base.sha }}\n          PULL_REQUEST_HEAD: ${{ github.event.pull_request.head.sha }}\n',
  );
});
