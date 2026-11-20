import { execFileSync } from "node:child_process";
import {
  cpSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readlinkSync,
  rmSync,
  symlinkSync,
} from "node:fs";
import { join } from "node:path";
import { folderHash } from "#/scripts/package-skills.ts";

const kitPackage = "node_modules/solid2-agent-kit";
export const kitBin = `${kitPackage}/bin/solid2-kit.mjs`;
export const kitSkillSource = `${kitPackage}/files/skills`;
export const sharedSkills = ".agents/skills";
export const claudeSkills = ".claude/skills";
export const copyScript = "scripts/copy-kit-skills.ts";

export function kitSkillNames(root: string): string[] {
  return readdirSync(join(root, kitSkillSource));
}

function linkTo(name: string): string {
  return `../../${sharedSkills}/${name}`;
}

function present(path: string): boolean {
  return lstatSync(path, { throwIfNoEntry: false }) !== undefined;
}

function heldAsCommitted(root: string, path: string): boolean {
  const git = (args: string[]) => {
    try {
      return execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: "pipe" }).trim();
    } catch (cause) {
      throw new Error(
        `${path}: telling a committed copy of the kit's from the project's own files needs git, and git ${args[0]} failed here. Run the copy in a git checkout.`,
        { cause },
      );
    }
  };
  return (
    git(["ls-files", "--", path]) !== "" &&
    git(["status", "--porcelain", "--untracked-files=all", "--ignored", "--", path]) === ""
  );
}

export function copyKitSkills(root: string, copiedBefore: readonly string[]): string[] {
  const names = kitSkillNames(root);
  const shared = (name: string) => `${sharedSkills}/${name}`;
  const linked = (name: string) => `${claudeSkills}/${name}`;
  const heldByTheProject = names.flatMap((name) => {
    const ours = copiedBefore.includes(name);
    const link = join(root, linked(name));
    return [
      ...(present(join(root, shared(name))) && !ours ? [shared(name)] : []),
      ...(present(link) &&
      !(ours && lstatSync(link).isSymbolicLink() && readlinkSync(link) === linkTo(name))
        ? [linked(name)]
        : []),
    ];
  });
  if (heldByTheProject.length > 0) {
    throw new Error(
      heldByTheProject
        .map((path) => `${path}: the kit ships a skill of this name, and it is the project's.`)
        .join("\n"),
    );
  }
  const dropped = copiedBefore.filter((name) => !names.includes(name));
  const changed = names.filter(
    (name) =>
      present(join(root, shared(name))) &&
      folderHash(join(root, shared(name))) !== folderHash(join(root, kitSkillSource, name)),
  );
  const removed = [
    ...dropped.flatMap((name) => [shared(name), linked(name)]),
    ...changed.map(shared),
  ];
  const notCommitted = removed.filter(
    (path) => present(join(root, path)) && !heldAsCommitted(root, path),
  );
  if (notCommitted.length > 0) {
    throw new Error(
      notCommitted
        .map(
          (path) =>
            `${path}: git does not hold it as committed, so it may be the project's. Commit it or move it away, then copy again.`,
        )
        .join("\n"),
    );
  }
  for (const path of removed) rmSync(join(root, path), { recursive: true, force: true });
  mkdirSync(join(root, sharedSkills), { recursive: true });
  mkdirSync(join(root, claudeSkills), { recursive: true });
  for (const name of names) {
    if (!present(join(root, shared(name)))) {
      cpSync(join(root, kitSkillSource, name), join(root, shared(name)), { recursive: true });
    }
    if (!present(join(root, linked(name)))) symlinkSync(linkTo(name), join(root, linked(name)));
  }
  return names;
}
