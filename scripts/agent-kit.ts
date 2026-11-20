import { cpSync, mkdirSync, readdirSync, rmSync, symlinkSync } from "node:fs";
import { join } from "node:path";

const kitPackage = "node_modules/solid2-agent-kit";
export const kitBin = `${kitPackage}/bin/solid2-kit.mjs`;
export const kitSkillSource = `${kitPackage}/files/skills`;
export const sharedSkills = ".agents/skills";
export const claudeSkills = ".claude/skills";
export const copyScript = "scripts/copy-kit-skills.ts";

export function kitInstalls(root: string, kind: "skills" | "commands"): string[] {
  return readdirSync(join(root, kitPackage, "files", kind)).map((name) =>
    name.replace(/\.md$/, ""),
  );
}

export function copyKitSkills(root: string): string[] {
  const names = kitInstalls(root, "skills");
  for (const name of names) {
    const shared = join(root, sharedSkills, name);
    const linked = join(root, claudeSkills, name);
    rmSync(shared, { recursive: true, force: true });
    rmSync(linked, { recursive: true, force: true });
    mkdirSync(join(root, sharedSkills), { recursive: true });
    cpSync(join(root, kitSkillSource, name), shared, { recursive: true });
    symlinkSync(`../../${sharedSkills}/${name}`, linked);
  }
  return names;
}
