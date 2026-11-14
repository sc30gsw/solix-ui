import { existsSync, globSync, lstatSync, readdirSync, readFileSync, readlinkSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vite-plus/test";
import { engineNames } from "../scripts/browser-engines.mjs";
import { repositoryRoot, rootManifest } from "./support/workspace";

const skillsDirectory = join(repositoryRoot, ".agents/skills");
const linkedSkillsDirectory = join(repositoryRoot, ".claude/skills");
const workflowFiles = globSync(".github/workflows/*.yml", { cwd: repositoryRoot });
const pathInBackticks = /`((?:packages|apps|tests|scripts|docs|\.agents|\.github)\/[^`:*\s]+)`/g;
const fileInBackticks = /`([\w./-]+\/[\w.-]+\.(?:ts|tsx|mjs|yml|json|md))`/g;

const skillNames = readdirSync(skillsDirectory).sort();

function read(path: string): string {
  return readFileSync(join(repositoryRoot, path), "utf8");
}

function frontMatterOf(text: string): Record<string, string> {
  const block = /^---\n([\s\S]*?)\n---\n/.exec(text)?.[1] ?? "";
  return Object.fromEntries(
    block
      .split("\n")
      .map((line) => /^([a-z-]+): (.*)$/.exec(line))
      .filter((match): match is RegExpExecArray => match !== null)
      .map(([, key, value]) => [key, value]),
  );
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
    .filter((name) => !skillNames.includes(name))
    .map((name) => `.claude/skills/${name}: remove it, there is no .agents/skills/${name}.`);

  expect(skillNames.length).toBeGreaterThan(0);
  expect([...violations, ...dangling]).toEqual([]);
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

test("every check in the repository runs through vp run verify, before a commit and in CI", () => {
  const manifest = rootManifest;
  const verify = manifest.scripts?.verify ?? "";

  expect(verify.split(" && ")).toEqual([
    "vp check --deny-warnings",
    "vp run lint:solid",
    "vp test",
  ]);
  expect(read(".vite-hooks/pre-commit").trim()).toBe("vp staged && vp run verify");
  const everyEngine = `playwright install --with-deps ${engineNames.join(" ")}`;
  for (const file of workflowFiles) {
    const workflow = read(file);
    const installs = workflow.split("\n").filter((line) => line.includes("playwright install"));
    if (/vp run (verify|evidence)/.test(workflow)) {
      expect(installs.length, `${file} installs the browser engines`).toBeGreaterThan(0);
    }
    for (const line of installs) {
      expect(line, `${file} installs every browser engine, as verify needs`).toContain(everyEngine);
    }
  }
  expect(read(".github/workflows/ci.yml")).toMatch(/- run: vp run verify$/m);
  expect(read("AGENTS.md")).toContain("`vp run verify`");
});
