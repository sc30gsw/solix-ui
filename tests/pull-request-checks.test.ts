import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join, matchesGlob } from "node:path";
import { describe, expect, test } from "vite-plus/test";
import { fixesWithoutATest, verificationFiles } from "#/scripts/fixes-carry-tests.ts";
import {
  footer,
  lineLimit,
  type PullRequestChanges,
  problemsOf,
  reviewLines,
  sectionOrder,
} from "#/scripts/pull-request-text.ts";
import { gitInScratchRepository } from "#/tests/support/git.ts";
import { inTemporaryTree } from "#/tests/support/temporary-tree.ts";
import { repositoryRoot } from "#/tests/support/workspace.ts";

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

function changesOf(files: readonly string[], after: readonly string[] = []): PullRequestChanges {
  return { files, changedSince: (commit) => (commit === reviewed ? after : undefined) };
}

describe("the text of a pull request", () => {
  test("reads no heading inside fenced code", () => {
    const body = bodyWith(sectionOrder).replace(
      "## Verification\n\nText.\n",
      "## Verification\n\n```md\n## Notes\n## Why\n```\n\n~~~\n## Scope\n~~~\n",
    );

    expect(problemsOf({ title, body })).toEqual([]);
  });

  test("passes with a Conventional title, its sections in order and the footer last, with any section but Scope and Verification dropped", () => {
    expect(problemsOf({ title, body: bodyWith(sectionOrder) })).toEqual([]);
    expect(problemsOf({ title: "fix(core)!: x", body: bodyWith(minimal) })).toEqual([]);
    expect(problemsOf({ title, body: bodyWith(sectionOrder).replaceAll("\n", "\r\n") })).toEqual(
      [],
    );
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
    expect(problemsOf({ title: badTitle, body: bodyWith(sectionOrder) }).join("\n")).toContain(
      said,
    );
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
    expect(problemsOf({ title, body }).join("\n")).toContain(said);
  });

  test(`fails a body of ${lineLimit} lines or more, counting every line but those of a mermaid chart`, () => {
    const filler = (lines: number) => "Text.\n".repeat(lines);
    const spare = lineLimit - bodyWith(minimal).trimEnd().split("\n").length;
    const atLimit = bodyWith(minimal).replace(
      "## Scope\n\nText.\n",
      `## Scope\n\n${filler(spare + 1)}`,
    );
    const underLimit = bodyWith(minimal).replace(
      "## Scope\n\nText.\n",
      `## Scope\n\n${filler(spare)}`,
    );
    const longChart = [
      "```mermaid",
      "stateDiagram-v2",
      ...Array.from({ length: 30 }, () => "  Open --> Closed: you press close"),
      "```",
    ].join("\n");
    const charted = underLimit.replace("## Verification\n\n", `## Verification\n\n${longChart}\n`);
    const otherFence = underLimit.replace(
      "## Verification\n\n",
      "## Verification\n\n```\na\n```\n",
    );

    expect(atLimit.trimEnd().split("\n").length).toBe(lineLimit);
    expect(problemsOf({ title, body: atLimit }).join("\n")).toContain(`under ${lineLimit} lines`);
    expect(problemsOf({ title, body: underLimit })).toEqual([]);
    expect(problemsOf({ title, body: charted })).toEqual([]);
    expect(problemsOf({ title, body: otherFence }).join("\n")).toContain(
      `under ${lineLimit} lines`,
    );
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

      for (const body of [without, pending, elsewhere]) {
        expect(problemsOf({ title, body }).join("\n")).toContain(`has no line "${line}<commit>"`);
      }
    },
  );

  test("fails a review line that names no commit of the pull request, or one after which the pull request changes more than the verification skills", () => {
    const body = bodyWith(minimal);

    expect(problemsOf({ title, body }, changesOf(["src/a.ts"]))).toEqual([]);
    expect(
      problemsOf({ title, body }, changesOf(["src/a.ts"], [".agents/skills/verify-tabs/SKILL.md"])),
    ).toEqual([]);
    expect(
      problemsOf({ title, body: bodyWith(minimal, undefined, "fedcba9") }, changesOf([])).join(
        "\n",
      ),
    ).toContain("which is not a commit of this pull request");
    const stale = problemsOf({ title, body }, changesOf(["src/a.ts"], ["src/a.ts", "AGENTS.md"]));
    expect(stale.join("\n")).toContain("changes src/a.ts, AGENTS.md after it");
    expect(stale.length).toBe(2);
  });

  test.each([
    [".agents/skills/verify-formal-tabs/SKILL.md", false],
    ["models/tabs.model.ts", true],
    ["models/Tabs.tla", true],
    ["models/Tabs.cfg", true],
  ])(
    "fails a pull request that changes %s with no mermaid chart, or without naming the model",
    (file, isModel) => {
      const charted = bodyWith(minimal).replace(
        "## Verification\n\n",
        `## Verification\n\n${chart}\n`,
      );
      const named = charted.replace("## Verification\n\n", `## Verification\n\n\`${file}\`:\n`);

      expect(
        problemsOf({ title, body: bodyWith(minimal) }, changesOf([file])).join("\n"),
      ).toContain("has no ```mermaid chart");
      expect(problemsOf({ title, body: charted }, changesOf([file])).join("\n")).toBe(
        isModel
          ? `The pull request changes the model ${file} but its body does not name it. Name it in backticks beside its chart.`
          : "",
      );
      expect(problemsOf({ title, body: named }, changesOf([file]))).toEqual([]);
      expect(problemsOf({ title, body: bodyWith(minimal) }, changesOf(["models/tabs.ts"]))).toEqual(
        [],
      );
    },
  );
});

type Run = { status: number | null; stdout: string; stderr: string };

async function inScratchPullRequest(
  use: (repository: {
    root: string;
    base: string;
    head: string;
    commit: (file: string) => string;
    check: (pullRequest: object, environment?: NodeJS.ProcessEnv) => Run;
  }) => void,
): Promise<void> {
  await inTemporaryTree({ "src/a.ts": "a\n" }, (root) => {
    const git = (...args: string[]) => gitInScratchRepository(root, args).trim();
    const commit = (file: string) => {
      writeFileSync(join(root, file), `${file} ${Math.random()}\n`);
      git("add", ".");
      git("commit", "--quiet", `--message=change ${file}`);
      return git("rev-parse", "HEAD");
    };
    git("init", "--quiet", "--initial-branch=main");
    git("add", ".");
    git("commit", "--quiet", "--message=base");
    const base = git("rev-parse", "HEAD");
    const head = commit("src/a.ts");
    const check = (pullRequest: object, environment: NodeJS.ProcessEnv = process.env) => {
      const event = join(root, `${Math.random()}-event.json`);
      writeFileSync(
        event,
        JSON.stringify({
          pull_request: { base: { sha: base }, head: { sha: head }, ...pullRequest },
        }),
      );
      return spawnSync(process.execPath, [textCheck, event], {
        cwd: root,
        encoding: "utf8",
        env: environment,
      });
    };
    use({ root, base, head, commit, check });
  });
}

describe("the text check", () => {
  const withTerms = { ...process.env, SOLIX_PRIVATE_TERMS: fakeTerm };

  test("reads the pull_request event, and fails on a private term in the title or the body without printing it", async () => {
    await inScratchPullRequest(({ head, check }) => {
      const body = bodyWith(sectionOrder, undefined, head.slice(0, 7));
      const clean = check({ title, body }, withTerms);
      const named = check({ title, body: body.replace("Text.", `Like ${fakeTerm}.`) }, withTerms);
      const badTitle = check({ title: `ci: like ${fakeTerm}`, body }, withTerms);

      expect([clean.status, clean.stderr]).toEqual([0, ""]);
      for (const failed of [named, badTitle]) {
        expect(failed.status).toBe(1);
        expect(failed.stderr).toContain("names a private term");
        expect(failed.stderr).not.toContain(fakeTerm);
      }
    });
  });

  test("reads the changed files and the reviewed commit from git: a commit after the reviewed one fails, and a chart is asked for when a model changes", async () => {
    await inScratchPullRequest(({ root, base, head, commit }) => {
      const reviewedHead = head;
      const skillConfirmed = (() => {
        writeFileSync(join(root, "SKILL.md"), "x\n");
        return commit("SKILL.md");
      })();
      const check = (pullRequest: object, to: string) => {
        const event = join(root, `${Math.random()}-event.json`);
        writeFileSync(
          event,
          JSON.stringify({
            pull_request: { base: { sha: base }, head: { sha: to }, ...pullRequest },
          }),
        );
        return spawnSync(process.execPath, [textCheck, event], {
          cwd: root,
          encoding: "utf8",
          env: withTerms,
        });
      };
      const body = bodyWith(minimal, undefined, reviewedHead);

      expect(check({ title, body }, reviewedHead).status).toBe(0);
      const afterReview = check({ title, body }, skillConfirmed);
      expect(afterReview.status).toBe(1);
      expect(afterReview.stderr).toContain("changes SKILL.md after it");
      const notInThePullRequest = check(
        { title, body: bodyWith(minimal, undefined, base) },
        reviewedHead,
      );
      expect(notInThePullRequest.stderr).toContain("which is not a commit of this pull request");
      const model = commit("Tabs.tla");
      const unchartered = check({ title, body: bodyWith(minimal, undefined, model) }, model);
      expect(unchartered.stderr).toContain("changes Tabs.tla but its body has no ```mermaid chart");
    });
  });

  test("checks only the private terms of a draft, and the rest once it is marked ready", async () => {
    await inScratchPullRequest(({ check }) => {
      const draft = check(
        { title: "Draft", body: "Generated by Claude Code", draft: true },
        withTerms,
      );
      const named = check({ title: "Draft", body: `Like ${fakeTerm}.`, draft: true }, withTerms);
      const ready = check(
        { title: "Draft", body: "Generated by Claude Code", draft: false },
        withTerms,
      );

      expect([draft.status, draft.stdout]).toEqual([0, expect.stringContaining("is a draft")]);
      expect([named.status, named.stderr]).toEqual([
        1,
        expect.stringContaining("names a private term"),
      ]);
      expect(ready.status).toBe(1);
      expect(ready.stderr).toContain("is not a Conventional Commit");
    });
  });

  test("checks a file with the title on line 1 and the body from line 3 against HEAD, as it would the opened pull request", async () => {
    await inScratchPullRequest(({ root, base, head }) => {
      const file = join(root, `${Math.random()}-pull-request.md`);
      const run = (text: string) => {
        writeFileSync(file, text);
        return spawnSync(process.execPath, [textCheck, "--file", file, "--base", base], {
          cwd: root,
          encoding: "utf8",
          env: withTerms,
        });
      };

      expect(run(`${title}\n\n${bodyWith(minimal, undefined, head)}`).status).toBe(0);
      expect(run(`${title}\n\n${bodyWith(minimal, undefined, base)}`).stderr).toContain(
        "which is not a commit of this pull request",
      );
      expect(
        spawnSync(process.execPath, [textCheck, "--file", file], { encoding: "utf8" }).status,
      ).toBe(2);
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
          base: { ...repositories.base, sha: base },
          head: { ...repositories.head, sha: head },
        },
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
    const tracked = gitInScratchRepository(repositoryRoot, ["ls-files", "-z"]).split("\0");
    const unmatched = verificationFiles.filter(
      (pattern) => !tracked.some((file) => matchesGlob(file, pattern)),
    );

    expect(unmatched).toEqual([]);
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

test("the pull request workflow runs both checks on every open, edit, push, reopening and mark as ready, in steps that only call the scripts", () => {
  const workflow = readFileSync(join(repositoryRoot, workflowFile), "utf8");

  expect(workflow).toContain(
    "  pull_request:\n    types: [opened, edited, synchronize, reopened, ready_for_review]\n",
  );
  expect(workflow).toContain(
    '      - run: node scripts/check-pull-request-text.ts "$GITHUB_EVENT_PATH"\n        env:\n          SOLIX_PRIVATE_TERMS: ${{ secrets.SOLIX_PRIVATE_TERMS }}\n',
  );
  expect(workflow).toContain(
    '      - run: node scripts/check-fixes-carry-tests.ts "$PULL_REQUEST_BASE" "$PULL_REQUEST_HEAD"\n        env:\n          PULL_REQUEST_BASE: ${{ github.event.pull_request.base.sha }}\n          PULL_REQUEST_HEAD: ${{ github.event.pull_request.head.sha }}\n',
  );
});
