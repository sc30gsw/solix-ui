import { spawnSync } from "node:child_process";
import {
  existsSync,
  globSync,
  lstatSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, join } from "node:path";
import { expect, test } from "vite-plus/test";
import { kitInstalls } from "#/scripts/agent-kit.ts";
import { engineNames } from "#/scripts/browser-engines.mjs";
import { approvedSkills, frontMatterOf } from "#/scripts/package-skills.ts";
import { pnpmSettings } from "#/scripts/pnpm-settings.ts";
import {
  outsideGeneratedOrInstalled,
  repositoryRoot,
  rootManifest,
  workflowFiles,
  workspaceFile,
} from "#/tests/support/workspace.ts";
import { inTemporaryTree } from "#/tests/support/temporary-tree.ts";
import { gitInScratchRepository } from "#/tests/support/git.ts";

const skillsDirectory = join(repositoryRoot, ".agents/skills");
const linkedSkillsDirectory = join(repositoryRoot, ".claude/skills");
const agentsDirectory = join(repositoryRoot, ".claude/agents");
const agentPathInBackticks = /`(\.(?:agents|claude)\/[^`*\s]+)`/g;
const trailingPunctuation = /[:.,]$/;
const verifyWithPrivateTerms =
  /- run: vp run verify\n\s+env:\n\s+SOLIX_PRIVATE_TERMS: \$\{\{ secrets\.SOLIX_PRIVATE_TERMS \}\}$/m;
const pathInBackticks = /`((?:packages|apps|tests|scripts|docs|\.agents|\.github)\/[^`:*\s]+)`/g;
const fileInBackticks = /`([\w./-]+\/[\w.-]+\.(?:ts|tsx|mjs|yml|json|md))`/g;
const notOneSpaceAtACellBorder = / {2,}\||\| {2,}|\S\||\|\S/;
const confirmedCommit = /Last confirmed against commit `([0-9a-f]{7,40})`/;
const diffPathList = /Run `git diff [0-9a-f]{7,40} -- ([^`]+)`/;
const backticked = /`([^`]+)`/g;
const checkoutSteps = /- uses: actions\/checkout@/g;
const fullHistory = /^\s+fetch-depth: 0$/gm;
const versionPrefix = /^[\^~]/;

const packageSkillIgnoreFile = ".gitignore";
const packageSkillEntries = [packageSkillIgnoreFile, ...approvedSkills().map(({ name }) => name)];
const kitSkillEntries = kitInstalls(repositoryRoot, "skills");

const skillNames = readdirSync(skillsDirectory)
  .filter((name) => !packageSkillEntries.includes(name))
  .sort();

function escapeForRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function skillText(name: string): string {
  const file = join(skillsDirectory, name, "SKILL.md");
  return existsSync(file) ? readFileSync(file, "utf8") : "";
}

function read(path: string): string {
  return readFileSync(join(repositoryRoot, path), "utf8");
}

test("every skill is named for its directory, described, and linked from .claude/skills", () => {
  const violations = skillNames.flatMap((name) => {
    const file = join(skillsDirectory, name, "SKILL.md");
    const problems: string[] = [];
    if (!existsSync(file)) return [`.agents/skills/${name}: add a SKILL.md.`];
    const front = frontMatterOf(readFileSync(file, "utf8"));
    if (front.name !== name)
      problems.push(
        `.agents/skills/${name}/SKILL.md: name must be "${name}", not "${front.name}".`,
      );
    if (!front.description)
      problems.push(`.agents/skills/${name}/SKILL.md: add a description that says when to use it.`);
    const link = join(linkedSkillsDirectory, name);
    const linked =
      existsSync(link) &&
      lstatSync(link).isSymbolicLink() &&
      readlinkSync(link) === `../../.agents/skills/${name}`;
    if (!linked)
      problems.push(
        `.claude/skills/${name}: make it a symbolic link to ../../.agents/skills/${name}.`,
      );
    return problems;
  });
  const dangling = readdirSync(linkedSkillsDirectory)
    .filter(
      (name) =>
        !skillNames.includes(name) &&
        !packageSkillEntries.includes(name) &&
        !kitSkillEntries.includes(name),
    )
    .map((name) => `.claude/skills/${name}: remove it, there is no .agents/skills/${name}.`);

  expect(skillNames.length).toBeGreaterThan(0);
  expect([...violations, ...dangling]).toEqual([]);
});

test("every .agents or .claude path that a project-owned skill names exists", () => {
  const vendored = Object.keys(
    (JSON.parse(read("skills-lock.json")) as { skills: Record<string, unknown> }).skills,
  );
  const projectOwned = skillNames.filter((name) => !vendored.includes(name));
  const violations = projectOwned.flatMap((name) =>
    [...skillText(name).matchAll(agentPathInBackticks)]
      .map(([, path]) => path.replace(trailingPunctuation, ""))
      .filter((path) => !existsSync(join(repositoryRoot, path)))
      .map(
        (path) =>
          `.agents/skills/${name}/SKILL.md: ${path} does not exist. A vendored skill may have been renamed upstream; point at its new path.`,
      ),
  );

  expect(projectOwned.length).toBeGreaterThan(0);
  expect(violations).toEqual([]);
});

test("every agent is named for its file and is started by an installed skill", () => {
  const agentFiles = readdirSync(agentsDirectory).filter((file) => file.endsWith(".md"));
  const skillTexts = skillNames
    .map((name) => join(skillsDirectory, name, "SKILL.md"))
    .filter((file) => existsSync(file))
    .map((file) => readFileSync(file, "utf8"));
  const violations = agentFiles.flatMap((file) => {
    const name = basename(file, ".md");
    const problems: string[] = [];
    const front = frontMatterOf(readFileSync(join(agentsDirectory, file), "utf8"));
    if (front.name !== name)
      problems.push(`.claude/agents/${file}: name must be "${name}", not "${front.name}".`);
    const startedBy = new RegExp(`subagent_type:\\s*["\`]?${escapeForRegExp(name)}(?![\\w-])`);
    if (!skillTexts.some((text) => startedBy.test(text)))
      problems.push(
        `.claude/agents/${file}: no skill in .agents/skills starts it with subagent_type: "${name}". Remove the agent, or install the skill that starts it.`,
      );
    return problems;
  });

  expect(agentFiles.length).toBeGreaterThan(0);
  expect(violations).toEqual([]);
});

test("every file a verification skill's covered-code table names exists", () => {
  const violations = skillNames
    .filter((name) => name.startsWith("verify-"))
    .flatMap((name) => {
      const text = readFileSync(join(skillsDirectory, name, "SKILL.md"), "utf8");
      const tableRows = text.split("\n").filter((line) => line.startsWith("|"));
      return tableRows
        .flatMap((row) => [...row.matchAll(pathInBackticks)].map(([, path]) => path))
        .filter((path) => !existsSync(join(repositoryRoot, path)))
        .map(
          (path) =>
            `.agents/skills/${name}/SKILL.md: the table names ${path}, which does not exist. Update the skill with the rename.`,
        );
    });

  expect(violations).toEqual([]);
});

test("every verification skill says which commit it was last confirmed against", () => {
  const violations = skillNames
    .filter((name) => name.startsWith("verify-") && name !== "verify-playground")
    .filter(
      (name) =>
        !/Last confirmed against commit `[0-9a-f]{7,40}`/.test(
          readFileSync(join(skillsDirectory, name, "SKILL.md"), "utf8"),
        ),
    )
    .map(
      (name) => `.agents/skills/${name}/SKILL.md: add "Last confirmed against commit \`<hash>\`."`,
    );

  expect(violations).toEqual([]);
});

const coveredCodeHeader = "Covered code";

function coveredPathsOf(text: string): string[] {
  const rows = text.split("\n").map((line) => (line.startsWith("| ") ? line : undefined));
  return rows
    .flatMap((row, index) => {
      if (row === undefined || row.startsWith("| ---")) return [];
      const header = rows.slice(0, index + 1).findLastIndex((line) => line === undefined) + 1;
      if (header === index) return [];
      const cells = (rows[header] ?? "").replace(/^\| | \|$/g, "").split(" | ");
      const column = Math.max(cells.indexOf(coveredCodeHeader), 0);
      return [...(row.split(" | ")[column] ?? "").matchAll(backticked)].map(([, path]) => path);
    })
    .filter((path) => existsSync(join(repositoryRoot, path)));
}

function coveredCellsOf(text: string): string[][] {
  const rows = text.split("\n").map((line) => (line.startsWith("| ") ? line : undefined));
  return rows.flatMap((row, index) => {
    if (row === undefined || row.startsWith("| ---")) return [];
    const header = rows.slice(0, index + 1).findLastIndex((line) => line === undefined) + 1;
    if (header === index) return [];
    const cells = (rows[header] ?? "").replace(/^\| | \|$/g, "").split(" | ");
    const column = cells.indexOf(coveredCodeHeader);
    if (column === -1) return [];
    return [[...(row.split(" | ")[column] ?? "").matchAll(backticked)].map(([, path]) => path)];
  });
}

function filesUnder(path: string): string[] {
  const matched = globSync(path, { cwd: repositoryRoot, exclude: outsideGeneratedOrInstalled });
  return matched.flatMap((found) =>
    statSync(join(repositoryRoot, found)).isDirectory()
      ? globSync(`${found}/**`, {
          cwd: repositoryRoot,
          exclude: outsideGeneratedOrInstalled,
        }).filter((file) => statSync(join(repositoryRoot, file)).isFile())
      : [found],
  );
}

test("every file a verification skill covers sits in one covered-code cell of its tables, so a change to it is described in one place", () => {
  const violations = skillNames
    .filter((name) => name.startsWith("verify-"))
    .flatMap((name) => {
      const cells = coveredCellsOf(skillText(name)).map((paths) => [
        ...new Set(paths.flatMap(filesUnder)),
      ]);
      const files = [...new Set(cells.flat())];
      return files.flatMap((file) => {
        const holding = cells.flatMap((cell, index) => (cell.includes(file) ? [index + 1] : []));
        return holding.length > 1
          ? [
              `.agents/skills/${name}/SKILL.md: ${file} sits in covered-code cells ${holding.join(" and ")}, counted down the tables. Describe it in one of them.`,
            ]
          : [];
      });
    });

  expect(violations).toEqual([]);
});

function covers(listed: string, path: string): boolean {
  return path === listed || path.startsWith(`${listed}/`);
}

test("every path a verification skill tells you to diff is in its covered-code table, and every path in the table is in the diff", () => {
  const violations = skillNames
    .filter((name) => name.startsWith("verify-"))
    .flatMap((name) => {
      const text = skillText(name);
      const listed = diffPathList.exec(text)?.[1]?.split(" ") ?? [];
      if (listed.length === 0) return [];
      const covered = coveredPathsOf(text);
      return [
        ...covered
          .filter((path) => !listed.some((entry) => covers(entry, path)))
          .map(
            (path) =>
              `.agents/skills/${name}/SKILL.md: the table covers ${path}, which the git diff command leaves out.`,
          ),
        ...listed
          .filter((entry) => !covered.some((path) => covers(entry, path)))
          .map(
            (entry) =>
              `.agents/skills/${name}/SKILL.md: the git diff command names ${entry}, which no row of the table covers.`,
          ),
      ];
    });

  expect(violations).toEqual([]);
});

function gitStatus(directory: string, args: readonly string[]): number | null {
  return spawnSync("git", args, { cwd: directory, stdio: "ignore" }).status;
}

function ancestryOf(
  commit: string,
  directory: string = repositoryRoot,
): "ancestor" | "not an ancestor" | "unknown" {
  const merging = gitStatus(directory, ["rev-parse", "--verify", "--quiet", "MERGE_HEAD"]) === 0;
  const statuses = (merging ? ["HEAD", "MERGE_HEAD"] : ["HEAD"]).map((head) =>
    gitStatus(directory, ["merge-base", "--is-ancestor", commit, head]),
  );
  if (statuses.includes(0)) return "ancestor";
  return statuses.every((status) => status === 1) ? "not an ancestor" : "unknown";
}

test("while a merge is being committed, a commit that HEAD or the merged commit contains counts as one HEAD contains, and one only the merged commit contains stops counting once the merge is aborted", async () => {
  await inTemporaryTree({ "file.txt": "base\n" }, (root) => {
    const probe = (...args: string[]) => gitInScratchRepository(root, args).trim();
    probe("init", "--quiet", "--initial-branch=main");
    probe("add", "file.txt");
    probe("commit", "--quiet", "--message=base");
    probe("switch", "--quiet", "--create", "incoming");
    writeFileSync(join(root, "incoming.txt"), "incoming\n");
    probe("add", "incoming.txt");
    probe("commit", "--quiet", "--message=incoming");
    const incoming = probe("rev-parse", "HEAD");
    probe("switch", "--quiet", "main");
    writeFileSync(join(root, "file.txt"), "main\n");
    probe("commit", "--quiet", "--all", "--message=main");
    const own = probe("rev-parse", "HEAD");

    expect(ancestryOf(incoming, root)).toBe("not an ancestor");
    probe("merge", "--quiet", "--no-commit", "--no-ff", "incoming");
    expect(ancestryOf(incoming, root)).toBe("ancestor");
    expect(ancestryOf(own, root)).toBe("ancestor");
    probe("merge", "--abort");
    expect(ancestryOf(incoming, root)).toBe("not an ancestor");
  });
});

test("every verification skill was last confirmed against a commit that HEAD contains, or, while a merge is being committed, that the merged commit contains, and CI checks out the history to tell", () => {
  const violations = skillNames
    .filter((name) => name.startsWith("verify-"))
    .flatMap((name) => {
      const commit = confirmedCommit.exec(skillText(name))?.[1];
      if (commit === undefined) return [];
      const ancestry = ancestryOf(commit);
      if (ancestry === "ancestor") return [];
      return [
        ancestry === "unknown"
          ? `.agents/skills/${name}/SKILL.md: it was last confirmed against ${commit}, which this clone does not hold. Name a commit of this branch.`
          : `.agents/skills/${name}/SKILL.md: it was last confirmed against ${commit}, which neither HEAD nor, during a merge, the merged commit contains. Confirm the skill against a commit of this branch and name that one.`,
      ];
    });
  const shallow = workflowFiles
    .filter((file) => {
      const text = read(file);
      return (text.match(fullHistory) ?? []).length < (text.match(checkoutSteps) ?? []).length;
    })
    .map(
      (file) =>
        `${file}: give every actions/checkout step \`fetch-depth: 0\`, so the tests can tell whether a skill's commit is in the history.`,
    );

  expect([...violations, ...shallow]).toEqual([]);
});

test("no project-owned skill copies a version from the catalog", () => {
  const vendored = Object.keys(
    (JSON.parse(read("skills-lock.json")) as { skills: Record<string, unknown> }).skills,
  );
  const versions = Object.entries(pnpmSettings().catalog)
    .filter(([, version]) => !version.includes(":"))
    .map(([name, version]): [string, string] => [name, version.replace(versionPrefix, "")]);
  const violations = skillNames
    .filter((name) => !vendored.includes(name))
    .flatMap((name) =>
      versions
        .filter(([, version]) => skillText(name).includes(version))
        .map(
          ([dependency, version]) =>
            `.agents/skills/${name}/SKILL.md: it copies ${version}, the version of ${dependency}. Point at the catalog in ${workspaceFile} instead, so an upgrade changes one line.`,
        ),
    );

  expect(versions.length).toBeGreaterThan(0);
  expect(violations).toEqual([]);
});

test("every file the rules table in AGENTS.md names exists", () => {
  const rows = read("AGENTS.md")
    .split("\n")
    .filter((line) => line.startsWith("|"));
  const violations = rows
    .flatMap((row) => [...row.matchAll(fileInBackticks)].map(([, path]) => path))
    .filter((path) => !existsSync(join(repositoryRoot, path)))
    .map((path) => `AGENTS.md: the table names ${path}, which does not exist.`);

  expect(rows.length).toBeGreaterThan(3);
  expect(violations).toEqual([]);
});

test("every row of the rules table in AGENTS.md is compact, so a rule edit changes one line", () => {
  const padded = read("AGENTS.md")
    .split("\n")
    .map((line, index) => ({ line, number: index + 1 }))
    .filter(({ line }) => line.startsWith("|") && notOneSpaceAtACellBorder.test(line))
    .map(({ number }) => `AGENTS.md:${number}`);

  expect(
    padded,
    "Write each row as `| Rule | Enforced by |`, with one space on each side of every |. Compact rows keep each rule edit to one line.",
  ).toEqual([]);
});

test("every check in the repository runs through vp run verify, before a commit, before a merge commit and in CI", () => {
  const verify = rootManifest().scripts?.verify ?? "";

  expect(verify.split(" && ")).toEqual([
    "vp check --deny-warnings",
    "vp run lint:solid",
    "vp run check:private-terms",
    "vp test",
  ]);
  expect(read(".vite-hooks/pre-commit").trim()).toBe(
    "node scripts/check-working-tree.ts && vp staged --no-stash && node scripts/check-working-tree.ts && vp run verify",
  );
  expect(read(".vite-hooks/pre-merge-commit").trim()).toBe(
    "node scripts/check-working-tree.ts && vp run verify",
  );
  const everyEngine = `playwright install --with-deps ${engineNames.join(" ")}`;
  for (const file of workflowFiles) {
    const workflow = read(file);
    const installs = workflow.split("\n").filter((line) => line.includes("playwright install"));
    if (/vp run (verify|evidence)/.test(workflow)) {
      expect(installs.length, `${file} installs the browser engines`).toBeGreaterThan(0);
    }
    if (/vp run verify/.test(workflow)) {
      expect(workflow, `${file} gives verify the private-term list`).toMatch(
        verifyWithPrivateTerms,
      );
    }
    for (const line of installs) {
      expect(line, `${file} installs every browser engine, as verify needs`).toContain(everyEngine);
    }
  }
  expect(read(".github/workflows/ci.yml")).toMatch(/- run: vp run verify$/m);
  expect(read("AGENTS.md")).toContain("`vp run verify`");
});

test("the process that runs the global setups and starts the test workers has no GIT_ variable, and a child that a test worker starts with the environment it inherits sees none, so a hook's GIT_DIR cannot point its git at this repository", () => {
  const inherited = spawnSync("sh", ["-c", "env"], { encoding: "utf8" })
    .stdout.split("\n")
    .filter((line) => line.startsWith("GIT_"))
    .map((line) => line.slice(0, line.indexOf("=")));

  expect(inherited).toEqual([]);
});
