import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, expect, test } from "vite-plus/test";
import {
  approvedSkills,
  linkProblems,
  type PackageSkill,
  reviewedHashes,
  reviewedSkillsFile,
  reviewProblems,
  skillDirectories,
} from "../scripts/package-skills";
import { repositoryRoot, workflowFiles, workspaceFile } from "./support/workspace";

const packageSkillIgnoreFile = ".gitignore";
const skillFolders = skillDirectories.join(" and ");
const installed = existsSync(join(repositoryRoot, "node_modules/.modules.yaml"));
const packageSkillCheck = "scripts/check-package-skills.ts";
const plainNodeTimeout = 30_000;
const testsPickedByTitle = /\bvp test\b.*\s(?:-t|--testNamePattern)\b/;
const skill: PackageSkill = { pack: "a-package", name: "a-skill" };
const skillText = "---\nname: a-skill\n---\nRead me.\n";
const recordedHash = /record its hash, ([0-9a-f]{64}),/;
const temporary: string[] = [];

afterEach(() => {
  for (const directory of temporary.splice(0)) rmSync(directory, { recursive: true });
});

function checkoutWithSkill(files: Record<string, string>): { root: string; skill: string } {
  const root = mkdtempSync(join(tmpdir(), "package-skills-"));
  const folder = join(root, "node_modules", skill.pack, "skills", skill.name);
  temporary.push(root);
  for (const [path, text] of Object.entries({ "SKILL.md": skillText, ...files })) {
    mkdirSync(dirname(join(folder, path)), { recursive: true });
    writeFileSync(join(folder, path), text);
  }
  for (const directory of skillDirectories) {
    mkdirSync(join(root, directory), { recursive: true });
    symlinkSync(folder, join(root, directory, skill.name));
  }
  return { root, skill: folder };
}

function problemsWith(root: string, hash?: string): string[] {
  return linkProblems(
    root,
    [skill],
    hash === undefined ? {} : { [skill.pack]: { [skill.name]: hash } },
  );
}

function hashOf(root: string): string {
  const hash = recordedHash.exec(problemsWith(root).join("\n"))?.[1];
  if (hash === undefined) throw new Error("The check names no hash to record.");
  return hash;
}

test("an approved skill passes with the hash the check tells you to record, and fails once a file of it changes, a hidden one included", () => {
  const { root, skill: folder } = checkoutWithSkill({ "notes/more.md": "More." });
  const reviewed = hashOf(root);

  expect(problemsWith(root, reviewed)).toEqual([]);
  mkdirSync(join(folder, ".hooks"));
  writeFileSync(join(folder, ".hooks/run.md"), "Run this.");
  expect(problemsWith(root, reviewed)).toEqual(
    skillDirectories.map((directory) =>
      expect.stringContaining(
        `${directory}/${skill.name}: ${skill.pack} changed the files of this skill`,
      ),
    ),
  );
});

test("a skill with no reviewed hash, a link no approval names, and an approved skill pnpm has not linked each fail", () => {
  const { root } = checkoutWithSkill({});
  const [directory] = skillDirectories;

  expect(problemsWith(root)[0]).toContain("ships this skill with no reviewed hash");
  expect(linkProblems(root, [], {})[0]).toBe(
    `${directory}/${skill.name}: it links a package skill that ${workspaceFile} does not approve. Remove the link, or read the skill and approve it there by name.`,
  );
  expect(linkProblems(root, [{ pack: skill.pack, name: "another" }], {})).toContain(
    `${directory}/another: pnpm has not linked ${skill.pack}'s skill another here. Run vp install.`,
  );
});

test("the hash tells where one file ends and the next begins: a file whose text holds another's path and text is not those two files", () => {
  const one = checkoutWithSkill({ a: "X\0b\0Y" });
  const two = checkoutWithSkill({ a: "X", b: "Y" });

  expect(hashOf(one.root)).not.toBe(hashOf(two.root));
});

test("a symbolic link inside a skill fails, to a file or a folder, and nothing is read through it", () => {
  const { root, skill: folder } = checkoutWithSkill({});
  const outside = join(root, "outside");
  mkdirSync(outside);
  symlinkSync(outside, join(outside, "back"));
  writeFileSync(join(outside, "secret.md"), "Not part of the skill.");
  symlinkSync(outside, join(folder, "more"));
  symlinkSync(join(outside, "secret.md"), join(folder, "secret.md"));
  const [directory] = skillDirectories;

  expect(problemsWith(root).filter((problem) => problem.startsWith(directory))).toEqual([
    expect.stringContaining(
      `${directory}/${skill.name}/more: ${skill.pack} ships a symbolic link here`,
    ),
    expect.stringContaining(
      `${directory}/${skill.name}/secret.md: ${skill.pack} ships a symbolic link here`,
    ),
  ]);
});

test("a named pipe inside a skill fails like a symbolic link, without being opened", () => {
  const { root, skill: folder } = checkoutWithSkill({});
  spawnSync("mkfifo", [join(folder, "pipe")]);
  const [directory] = skillDirectories;

  expect(problemsWith(root).filter((problem) => problem.startsWith(directory))).toEqual([
    expect.stringContaining(`${directory}/${skill.name}/pipe: ${skill.pack} ships a symbolic link`),
  ]);
});

test("a skill whose SKILL.md is a symbolic link fails without being read", () => {
  const { root, skill: folder } = checkoutWithSkill({});
  rmSync(join(folder, "SKILL.md"));
  symlinkSync(join(root, "nowhere.md"), join(folder, "SKILL.md"));
  const [directory] = skillDirectories;

  expect(problemsWith(root).filter((problem) => problem.startsWith(directory))).toEqual([
    expect.stringContaining(
      `${directory}/${skill.name}/SKILL.md: ${skill.pack} ships a symbolic link here`,
    ),
  ]);
});

test(`${reviewedSkillsFile} records a reviewed hash for exactly the package skills ${workspaceFile} approves`, () => {
  expect(reviewProblems(approvedSkills(), reviewedHashes())).toEqual([]);
  expect(reviewProblems([skill], { [skill.pack]: { another: "0" } })).toEqual([
    `${reviewedSkillsFile}: record the reviewed hash of ${skill.pack} ${skill.name}, which ${workspaceFile} approves.`,
    `${reviewedSkillsFile}: remove ${skill.pack} another, which ${workspaceFile} does not approve.`,
  ]);
});

function trackedFiles(directory: string): string[] {
  return spawnSync("git", ["ls-files", "--", directory], { cwd: repositoryRoot, encoding: "utf8" })
    .stdout.split("\n")
    .filter((line) => line !== "");
}

function isIgnored(path: string): boolean {
  return spawnSync("git", ["check-ignore", "-q", path], { cwd: repositoryRoot }).status === 0;
}

test(`in ${skillFolders}, git ignores the approved package skills and tracks every other entry`, () => {
  const approved = approvedSkills();
  const violations = skillDirectories.flatMap((directory) => {
    const tracked = trackedFiles(directory);
    const isTracked = (entry: string) =>
      tracked.some(
        (file) => file === `${directory}/${entry}` || file.startsWith(`${directory}/${entry}/`),
      );
    const entries = existsSync(join(repositoryRoot, directory))
      ? readdirSync(join(repositoryRoot, directory))
      : [];
    return [
      ...approved
        .filter(({ name }) => isTracked(name))
        .map(
          ({ pack, name }) =>
            `${directory}/${name}: a project skill has the name of the skill ${pack} ships and ${workspaceFile} approves. Rename one of them.`,
        ),
      ...approved
        .filter(({ name }) => !isTracked(name) && !isIgnored(`${directory}/${name}`))
        .map(
          ({ name }) =>
            `${directory}/${name}: let pnpm's ${packageSkillIgnoreFile} there ignore it; run vp install and commit that file.`,
        ),
      ...entries
        .filter((entry) => !approved.some(({ name }) => name === entry))
        .filter((entry) => !isTracked(entry))
        .map(
          (entry) =>
            `${directory}/${entry}: it is neither tracked nor a package skill ${workspaceFile} approves. Commit it, approve it there, or remove it.`,
        ),
    ];
  });

  expect(violations).toEqual([]);
});

test.skipIf(!installed)(
  `pnpm links exactly the approved package skills into ${skillFolders}, each to its package, holding the files whose hash ${reviewedSkillsFile} records`,
  () => {
    expect(linkProblems(repositoryRoot, approvedSkills(), reviewedHashes())).toEqual([]);
  },
);

test.skipIf(!installed)(
  `plain Node runs ${packageSkillCheck}, with no build and no test runner`,
  () => {
    const check = spawnSync(process.execPath, [packageSkillCheck], {
      cwd: repositoryRoot,
      encoding: "utf8",
      timeout: plainNodeTimeout,
    });

    expect(check.stderr).toBe("");
    expect(check.status).toBe(0);
  },
);

test(`the Solid 2 canary checks the package skills in a step of its own with plain Node, and no workflow picks tests by title`, () => {
  const lines = workflowFiles.flatMap((file) =>
    readFileSync(join(repositoryRoot, file), "utf8")
      .split("\n")
      .map((line, index) => ({ line, at: `${file}:${index + 1}` })),
  );
  const pickedByTitle = lines
    .filter(({ line }) => testsPickedByTitle.test(line))
    .map(
      ({ at }) =>
        `${at}: a title filter that matches no test passes. Run a test file by its path, or a script.`,
    );

  expect(lines.map(({ line }) => line)).toContain(`        run: node ${packageSkillCheck}`);
  expect(pickedByTitle).toEqual([]);
});
