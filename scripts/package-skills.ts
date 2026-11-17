import { createHash } from "node:crypto";
import {
  existsSync,
  lstatSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  realpathSync,
} from "node:fs";
import { join } from "node:path";
import { pnpmSettings, workspaceFile } from "#/scripts/pnpm-settings.ts";
import { repositoryRoot } from "#/scripts/repository.ts";

export const reviewedSkillsFile = "scripts/reviewed-skills.json";
export const skillDirectories = [".agents/skills", ".claude/skills"];
const skillFile = "SKILL.md";

export type PackageSkill = { pack: string; name: string };
export type ReviewedHashes = Record<string, Record<string, string>>;

export function approvedSkills(): PackageSkill[] {
  return Object.entries(pnpmSettings().approvedSkills).flatMap(([pack, names]) =>
    names.map((name) => ({ pack, name })),
  );
}

export function reviewedHashes(): ReviewedHashes {
  return JSON.parse(readFileSync(join(repositoryRoot, reviewedSkillsFile), "utf8"));
}

export function frontMatterOf(text: string): Record<string, string> {
  const block = /^---\n([\s\S]*?)\n---\n/.exec(text)?.[1] ?? "";
  return Object.fromEntries(
    block
      .split("\n")
      .map((line) => /^([a-z-]+): (.*)$/.exec(line))
      .filter((match): match is RegExpExecArray => match !== null)
      .map(([, key, value]) => [key, value]),
  );
}

function byCodeUnit(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function skillFolderEntries(folder: string): { files: string[]; neitherFileNorFolder: string[] } {
  const files: string[] = [];
  const neitherFileNorFolder: string[] = [];
  const walk = (directory: string): void => {
    for (const name of readdirSync(join(folder, directory))) {
      const path = directory === "" ? name : `${directory}/${name}`;
      const entry = lstatSync(join(folder, path));
      if (entry.isDirectory()) walk(path);
      else if (entry.isFile()) files.push(path);
      else neitherFileNorFolder.push(path);
    }
  };
  walk("");
  return {
    files: files.sort(byCodeUnit),
    neitherFileNorFolder: neitherFileNorFolder.sort(byCodeUnit),
  };
}

function lengthPrefixed(bytes: Buffer): Buffer[] {
  return [Buffer.from(`${bytes.length}:`), bytes];
}

function hashOfFiles(folder: string, files: readonly string[]): string {
  const hash = createHash("sha256");
  for (const path of files) {
    for (const part of [Buffer.from(path), readFileSync(join(folder, path))]) {
      for (const chunk of lengthPrefixed(part)) hash.update(chunk);
    }
  }
  return hash.digest("hex");
}

export function reviewProblems(
  approved: readonly PackageSkill[],
  reviewed: ReviewedHashes,
): string[] {
  const recorded = Object.entries(reviewed).flatMap(([pack, skills]) =>
    Object.keys(skills).map((name) => ({ pack, name })),
  );
  const isIn = (list: readonly PackageSkill[], { pack, name }: PackageSkill) =>
    list.some((entry) => entry.pack === pack && entry.name === name);
  return [
    ...approved
      .filter((skill) => !isIn(recorded, skill))
      .map(
        ({ pack, name }) =>
          `${reviewedSkillsFile}: record the reviewed hash of ${pack} ${name}, which ${workspaceFile} approves.`,
      ),
    ...recorded
      .filter((skill) => !isIn(approved, skill))
      .map(
        ({ pack, name }) =>
          `${reviewedSkillsFile}: remove ${pack} ${name}, which ${workspaceFile} does not approve.`,
      ),
  ];
}

function linkedSkillProblems(
  root: string,
  directory: string,
  { pack, name }: PackageSkill,
  reviewed: string | undefined,
): string[] {
  const link = join(root, directory, name);
  const target = existsSync(link) && lstatSync(link).isSymbolicLink() ? readlinkSync(link) : "";
  if (!target.includes(`/node_modules/${pack}/skills/${name}`)) {
    return [
      `${directory}/${name}: pnpm has not linked ${pack}'s skill ${name} here. Run vp install.`,
    ];
  }
  const folder = realpathSync(link);
  const { files, neitherFileNorFolder } = skillFolderEntries(folder);
  if (neitherFileNorFolder.length > 0) {
    return neitherFileNorFolder.map(
      (path) =>
        `${directory}/${name}/${path}: ${pack} ships a symbolic link here, or something else that is neither a file nor a folder, which the reviewed hash does not follow. Do not approve the skill until it ships files only.`,
    );
  }
  if (!files.includes(skillFile)) {
    return [`${directory}/${name}: ${pack} ships this skill without a ${skillFile}.`];
  }
  const front = frontMatterOf(readFileSync(join(folder, skillFile), "utf8"));
  const hash = hashOfFiles(folder, files);
  return [
    ...(front.name === name
      ? []
      : [`${directory}/${name}/${skillFile}: ${pack} names this skill "${front.name}".`]),
    ...(hash === reviewed
      ? []
      : [
          `${directory}/${name}: ${pack} ${reviewed === undefined ? "ships this skill with no reviewed hash" : "changed the files of this skill"}. Read every file of it, hidden ones included, as data, then record its hash, ${hash}, in ${reviewedSkillsFile}.`,
        ]),
  ];
}

export function linkProblems(
  root: string,
  approved: readonly PackageSkill[],
  reviewed: ReviewedHashes,
): string[] {
  return skillDirectories.flatMap((directory) => {
    const linkedToPackages = readdirSync(join(root, directory)).filter((entry) => {
      const path = join(root, directory, entry);
      return lstatSync(path).isSymbolicLink() && readlinkSync(path).includes("node_modules/");
    });
    return [
      ...linkedToPackages
        .filter((entry) => !approved.some(({ name }) => name === entry))
        .map(
          (entry) =>
            `${directory}/${entry}: it links a package skill that ${workspaceFile} does not approve. Remove the link, or read the skill and approve it there by name.`,
        ),
      ...approved.flatMap((skill) =>
        linkedSkillProblems(root, directory, skill, reviewed[skill.pack]?.[skill.name]),
      ),
    ];
  });
}

export function packageSkillProblems(): string[] {
  const approved = approvedSkills();
  const reviewed = reviewedHashes();
  return [
    ...reviewProblems(approved, reviewed),
    ...linkProblems(repositoryRoot, approved, reviewed),
  ];
}
