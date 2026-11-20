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

function removeCopy(root: string, name: string): void {
  rmSync(join(root, sharedSkills, name), { recursive: true, force: true });
  rmSync(join(root, claudeSkills, name), { recursive: true, force: true });
}

export function copyKitSkills(root: string, copiedBefore: readonly string[]): string[] {
  const names = kitSkillNames(root);
  const heldByTheProject = names.flatMap((name) => {
    const shared = join(root, sharedSkills, name);
    const linked = join(root, claudeSkills, name);
    const ours = copiedBefore.includes(name);
    return [
      ...(present(shared) && !ours ? [`${sharedSkills}/${name}`] : []),
      ...(present(linked) &&
      !(ours && lstatSync(linked).isSymbolicLink() && readlinkSync(linked) === linkTo(name))
        ? [`${claudeSkills}/${name}`]
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
  for (const name of copiedBefore.filter((name) => !names.includes(name))) removeCopy(root, name);
  mkdirSync(join(root, sharedSkills), { recursive: true });
  mkdirSync(join(root, claudeSkills), { recursive: true });
  for (const name of names) {
    removeCopy(root, name);
    cpSync(join(root, kitSkillSource, name), join(root, sharedSkills, name), { recursive: true });
    symlinkSync(linkTo(name), join(root, claudeSkills, name));
  }
  return names;
}
