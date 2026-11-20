import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const kitPackage = "node_modules/solid2-agent-kit";
export const kitBin = `${kitPackage}/bin/solid2-kit.mjs`;
export const settingsFile = ".claude/settings.json";
export const syncScript = "scripts/sync-agent-kit.ts";
export const kitNotInstalled = "The Solid 2 kit is not installed, so its hook does not run.";
export const kitHookDidNotRun =
  "The Solid 2 kit's hook did not run, so it is taken as a failed check.";

const kitHook = `${kitBin} hook claude`;
const fromTheProjectDirectory = `[ -f "$CLAUDE_PROJECT_DIR/${kitBin}" ] || { echo "${kitNotInstalled}" >&2; exit 0; }; cd "$CLAUDE_PROJECT_DIR" && node ${kitHook}`;
const failingClosed = `${fromTheProjectDirectory}; status=$?; [ $status -eq 0 ] || [ $status -eq 2 ] || { echo "${kitHookDidNotRun}" >&2; exit 2; }; exit $status`;

export const kitHookEvents = ["PreToolUse", "PostToolUse", "Stop"] as const;

export type KitHookEvent = (typeof kitHookEvents)[number];

export const kitHookCommands: Record<KitHookEvent, string> = {
  PreToolUse: failingClosed,
  PostToolUse: failingClosed,
  Stop: fromTheProjectDirectory,
};

export const kitFileTools = "Edit|MultiEdit|Write";

type HookEntry = { matcher?: string; hooks?: { type?: string; command?: string }[] };

type Settings = { hooks?: Partial<Record<string, HookEntry[]>> };

export function readSettings(root: string): Settings {
  return JSON.parse(readFileSync(join(root, settingsFile), "utf8"));
}

export function kitHookEntries(settings: Settings, event: KitHookEvent): HookEntry[] {
  return (settings.hooks?.[event] ?? []).filter(({ hooks }) =>
    (hooks ?? []).some(({ command }) => command?.includes(kitHook) === true),
  );
}

export function kitVersion(root: string): string {
  return JSON.parse(readFileSync(join(root, kitPackage, "package.json"), "utf8")).version;
}

export function kitInstalls(root: string, kind: "skills" | "commands"): string[] {
  return readdirSync(join(root, kitPackage, "files", kind)).map((name) =>
    name.replace(/\.md$/, ""),
  );
}

export function syncAgentKit(root: string): string {
  const sync = spawnSync(process.execPath, [join(root, kitBin), "sync", "--claude"], {
    cwd: root,
    encoding: "utf8",
  });
  if (sync.status !== 0) {
    throw new Error(`solid2-kit sync --claude failed in ${root}:\n${sync.stdout}${sync.stderr}`);
  }
  const settings = readSettings(root);
  for (const event of kitHookEvents) {
    const entries = kitHookEntries(settings, event);
    if (entries.length !== 1) {
      throw new Error(
        `solid2-kit sync wrote ${entries.length} ${event} entries to ${settingsFile}, not one.`,
      );
    }
    if (event === "PreToolUse") {
      for (const entry of entries) entry.matcher = kitFileTools;
    }
    for (const hook of entries.flatMap(({ hooks }) => hooks ?? [])) {
      hook.command = kitHookCommands[event];
    }
  }
  writeFileSync(join(root, settingsFile), `${JSON.stringify(settings, null, 2)}\n`);
  return sync.stdout;
}
