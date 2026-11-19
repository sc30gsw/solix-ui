import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join, matchesGlob } from "node:path";
import { describe, expect, test } from "vite-plus/test";
import { fixesWithoutATest, verificationFiles } from "#/scripts/fixes-carry-tests.ts";
import { footer, problemsOf, sectionOrder } from "#/scripts/pull-request-text.ts";
import { gitInScratchRepository } from "#/tests/support/git.ts";
import { inTemporaryTree } from "#/tests/support/temporary-tree.ts";
import { repositoryRoot } from "#/tests/support/workspace.ts";

const workflowFile = ".github/workflows/pull-request.yml";
const textCheck = join(repositoryRoot, "scripts/check-pull-request-text.ts");
const fixCheck = join(repositoryRoot, "scripts/check-fixes-carry-tests.ts");
const session = "https://claude.ai/code/session_01AbCdEf";
const title = "ci: check the text of every pull request";
const fakeTerm = "zorblax";

function bodyWith(sections: readonly string[], ending = `${footer}\n\n${session}\n`): string {
  return `${sections.map((section) => `## ${section}\n\nText.\n`).join("\n")}\n${ending}`;
}

describe("the text of a pull request", () => {
  test("passes with a Conventional title, its sections in order and the footer last, with any section but Scope dropped", () => {
    expect(problemsOf({ title, body: bodyWith(sectionOrder) })).toEqual([]);
    expect(problemsOf({ title: "fix(core)!: x", body: bodyWith(["Scope"]) })).toEqual([]);
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
    ["Scope before Why", bodyWith(["Scope", "Why"]), "in the order Scope, Why"],
    [
      "Verification before Tradeoffs",
      bodyWith(["Scope", "Verification", "Tradeoffs"]),
      "Put them in the order",
    ],
    ["a section of its own", bodyWith(["Scope", "Notes"]), 'the section "## Notes"'],
    ["a section twice", bodyWith(["Scope", "Scope"]), 'has "## Scope" more than once'],
    ["no footer", bodyWith(["Scope"], ""), "does not end with the line"],
    [
      "the footer without the session URL",
      bodyWith(["Scope"], `${footer}\n`),
      "does not end with the line",
    ],
    [
      "the session URL with no footer",
      bodyWith(["Scope"], `${session}\n`),
      "does not end with the line",
    ],
    [
      "the footer and then a link that is not a session URL",
      bodyWith(["Scope"], `${footer}\n\nhttps://claude.ai/code\n`),
      "does not end with the line",
    ],
    [
      "the session URL before the footer",
      bodyWith(["Scope"], `${session}\n\n${footer}\n`),
      "does not end with the line",
    ],
    [
      "text after the footer",
      bodyWith(["Scope"], `${footer}\n\n${session}\n\nMore.\n`),
      "does not end with the line",
    ],
  ])("fails a body with %s", (_, body, said) => {
    expect(problemsOf({ title, body }).join("\n")).toContain(said);
  });

  test("the check reads the pull_request event, and fails on a private term in the title or the body without printing it", async () => {
    await inTemporaryTree({}, (directory) => {
      const run = (pullRequest: object) => {
        const event = join(directory, "event.json");
        writeFileSync(event, JSON.stringify({ pull_request: pullRequest }));
        return spawnSync(process.execPath, [textCheck, event], {
          encoding: "utf8",
          env: { ...process.env, SOLIX_PRIVATE_TERMS: fakeTerm },
        });
      };
      const clean = run({ title, body: bodyWith(sectionOrder) });
      const named = run({
        title,
        body: bodyWith(sectionOrder).replace("Text.", `Like ${fakeTerm}.`),
      });
      const badTitle = run({ title: `ci: like ${fakeTerm}`, body: bodyWith(sectionOrder) });

      expect([clean.status, clean.stderr]).toEqual([0, ""]);
      for (const failed of [named, badTitle]) {
        expect(failed.status).toBe(1);
        expect(failed.stderr).toContain("names a private term");
        expect(failed.stderr).not.toContain(fakeTerm);
      }
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
    ["fix(skills): a", [".agents/skills/verify-playground/scripts/drive.mjs"], false],
    ["feat: a", ["src/a.ts"], false],
    ["docs: fix a typo", ["README.md"], false],
    ['Revert "fix: a"', ["src/a.ts"], false],
    ["fix(tests): a", ["scripts/expected-values.ts"], false],
    [
      "fix(tabs): a",
      ["packages/core/src/TabsTab.tsx", ".agents/skills/verify-playground/features/tabs-focus.md"],
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

test("the pull request workflow runs both checks on every open, edit and push, in steps that only call the scripts", () => {
  const workflow = readFileSync(join(repositoryRoot, workflowFile), "utf8");

  expect(workflow).toContain("  pull_request:\n    types: [opened, edited, synchronize]\n");
  expect(workflow).toContain(
    '      - run: node scripts/check-pull-request-text.ts "$GITHUB_EVENT_PATH"\n        env:\n          SOLIX_PRIVATE_TERMS: ${{ secrets.SOLIX_PRIVATE_TERMS }}\n',
  );
  expect(workflow).toContain(
    '      - run: node scripts/check-fixes-carry-tests.ts "$PULL_REQUEST_BASE" "$PULL_REQUEST_HEAD"\n        env:\n          PULL_REQUEST_BASE: ${{ github.event.pull_request.base.sha }}\n          PULL_REQUEST_HEAD: ${{ github.event.pull_request.head.sha }}\n',
  );
});
