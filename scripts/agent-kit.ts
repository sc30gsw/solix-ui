import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";

export const kitPackage = "node_modules/solid2-agent-kit";
export const kitBin = `${kitPackage}/bin/solid2-kit.mjs`;
export const settingsFile = ".claude/settings.json";
export const sharedSkills = ".agents/skills";
export const claudeSkills = ".claude/skills";
export const claudeCommands = ".claude/commands";
export const syncScript = "scripts/sync-agent-kit.ts";
export const agentsDocument = "AGENTS.md";
export const kitProse = ["CLAUDE.md"];
export const kitBlockStart = "<!-- solid2-agent-kit:";
const kitBlock =
  /<!-- solid2-agent-kit:([\w-]+):start -->[\s\S]*?<!-- solid2-agent-kit:\1:end -->/g;
const blankLinesLeft = /\n{3,}/g;

type Settings = { hooks?: Record<string, unknown> };

export function readSettings(root: string): Settings {
  return JSON.parse(readFileSync(join(root, settingsFile), "utf8"));
}

export function kitVersion(root: string): string {
  return JSON.parse(readFileSync(join(root, kitPackage, "package.json"), "utf8")).version;
}

export function kitInstalls(root: string, kind: "skills" | "commands"): string[] {
  return readdirSync(join(root, kitPackage, "files", kind)).map((name) =>
    name.replace(/\.md$/, ""),
  );
}

export function withoutKitBlocks(text: string): string {
  return text.includes(kitBlockStart)
    ? `${text.replace(kitBlock, "").replace(blankLinesLeft, "\n\n").trimEnd()}\n`
    : text;
}

export function syncAgentKit(root: string): string {
  const sync = spawnSync(process.execPath, [join(root, kitBin), "sync", "--claude", "--no-hooks"], {
    cwd: root,
    encoding: "utf8",
  });
  if (sync.status !== 0) {
    throw new Error(`solid2-kit sync failed in ${root}:\n${sync.stdout}${sync.stderr}`);
  }
  for (const file of kitProse) rmSync(join(root, file), { force: true });
  for (const name of kitInstalls(root, "commands")) {
    rmSync(join(root, claudeCommands, `${name}.md`), { force: true });
  }
  const commands = join(root, claudeCommands);
  if (existsSync(commands) && readdirSync(commands).length === 0) rmdirSync(commands);
  const agents = readFileSync(join(root, agentsDocument), "utf8");
  writeFileSync(join(root, agentsDocument), withoutKitBlocks(agents));
  for (const name of kitInstalls(root, "skills")) {
    const shared = join(root, sharedSkills, name);
    rmSync(shared, { recursive: true, force: true });
    mkdirSync(dirname(shared), { recursive: true });
    renameSync(join(root, claudeSkills, name), shared);
    symlinkSync(`../../${sharedSkills}/${name}`, join(root, claudeSkills, name));
  }
  return sync.stdout;
}
