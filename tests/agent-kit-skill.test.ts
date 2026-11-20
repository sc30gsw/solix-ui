import { spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  lstatSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  symlinkSync,
} from "node:fs";
import { join } from "node:path";
import { expect, test } from "vite-plus/test";
import {
  claudeSkills,
  copyScript,
  kitBin,
  kitInstalls,
  kitSkillSource,
  sharedSkills,
} from "#/scripts/agent-kit.ts";
import { approvedSkills } from "#/scripts/package-skills.ts";
import { workspaceFile } from "#/scripts/pnpm-settings.ts";
import { inTemporaryTree } from "#/tests/support/temporary-tree.ts";
import { repositoryRoot } from "#/tests/support/workspace.ts";

const manifest = "package.json";
const installed = "node_modules";
const kitTraces = ["<!-- solid2-agent-kit:", `${kitBin} hook`];
const filesTheKitEdits = ["AGENTS.md", ".claude/settings.json"];
const settingsFile = ".claude/settings.json";
const settingsKeys = ["enabledPlugins", "env", "extraKnownMarketplaces"];
const replacedByTheKit = [
  { pack: "solid-js", name: "solid-2.0" },
  { pack: "solid-js", name: "solid-2.0-cheatsheet" },
];

function filesIn(root: string, directory = ""): string[] {
  return readdirSync(join(root, directory), { withFileTypes: true }).flatMap((entry) => {
    const path = directory === "" ? entry.name : `${directory}/${entry.name}`;
    return entry.isDirectory() ? filesIn(root, path) : [path];
  });
}

function read(path: string): string {
  return readFileSync(join(repositoryRoot, path), "utf8");
}

test(`each skill the kit ships sits in ${sharedSkills} exactly as the kit ships it, linked from ${claudeSkills}, as ${copyScript} copies it`, () => {
  const problems = kitInstalls(repositoryRoot, "skills").flatMap((name) => {
    const source = join(repositoryRoot, kitSkillSource, name);
    const copy = join(repositoryRoot, sharedSkills, name);
    const link = join(repositoryRoot, claudeSkills, name);
    const shipped = filesIn(source).sort();
    const held = existsSync(copy) ? filesIn(copy).sort() : [];
    return [
      ...[...new Set([...shipped, ...held])]
        .filter(
          (path) =>
            !shipped.includes(path) ||
            !held.includes(path) ||
            readFileSync(join(source, path), "utf8") !== readFileSync(join(copy, path), "utf8"),
        )
        .map(
          (path) =>
            `${sharedSkills}/${name}/${path}: it is not the kit's file. Run node ${copyScript}.`,
        ),
      ...(existsSync(link) &&
      lstatSync(link).isSymbolicLink() &&
      readlinkSync(link) === `../../${sharedSkills}/${name}`
        ? []
        : [
            `${claudeSkills}/${name}: make it a link to ../../${sharedSkills}/${name}. Run node ${copyScript}.`,
          ]),
    ];
  });

  expect(kitInstalls(repositoryRoot, "skills").length).toBeGreaterThan(0);
  expect(problems).toEqual([]);
});

test("nothing the kit's installer writes, for Claude Code or Cursor, is in the repository but the skill it shares, so no agent gets a rule of its own", async () => {
  const outputs = await inTemporaryTree({}, (root) => {
    symlinkSync(join(repositoryRoot, installed), join(root, installed));
    cpSync(join(repositoryRoot, manifest), join(root, manifest));
    const sync = spawnSync(process.execPath, [join(root, kitBin), "sync"], {
      cwd: root,
      encoding: "utf8",
    });
    expect(sync.status, sync.stderr).toBe(0);
    return filesIn(root).filter((path) => path !== manifest && path !== installed);
  });
  const shared = kitInstalls(repositoryRoot, "skills").map((name) => `${claudeSkills}/${name}/`);
  const leftOver = outputs.flatMap((path) => {
    if (shared.some((skill) => path.startsWith(skill))) return [];
    if (filesTheKitEdits.includes(path)) {
      return kitTraces.some((trace) => read(path).includes(trace))
        ? [`${path}: it holds what the kit's installer writes. Remove it.`]
        : [];
    }
    return existsSync(join(repositoryRoot, path))
      ? [
          `${path}: the kit's installer writes it for one agent. Remove it; ${copyScript} copies only the kit's skills.`,
        ]
      : [];
  });

  expect(outputs).toContain("CLAUDE.md");
  expect(outputs.some((path) => path.startsWith(".cursor/"))).toBe(true);
  expect(leftOver).toEqual([]);
});

test(`${settingsFile} holds only the plugins, their marketplaces and the environment, and so no hook`, () => {
  expect(Object.keys(JSON.parse(read(settingsFile))).sort()).toEqual(settingsKeys);
});

test(`${workspaceFile} approves neither skill of solid-js's that the kit's solid-2 skill replaces`, () => {
  const replaced = approvedSkills()
    .filter(({ pack, name }) =>
      replacedByTheKit.some((skill) => skill.pack === pack && skill.name === name),
    )
    .map(
      ({ pack, name }) =>
        `${pack} ${name}: the kit's solid-2 skill says what it says. Leave it out of permissions in ${workspaceFile}.`,
    );

  expect(replaced).toEqual([]);
});
