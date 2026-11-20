import { execFileSync, spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { expect, test } from "vite-plus/test";
import {
  claudeSkills,
  copyKitSkills,
  copyScript,
  kitBin,
  kitSkillNames,
  kitSkillSource,
  sharedSkills,
} from "#/scripts/agent-kit.ts";
import { approvedSkills, folderHash, kitSkills } from "#/scripts/package-skills.ts";
import { workspaceFile } from "#/scripts/pnpm-settings.ts";
import { inTemporaryTree } from "#/tests/support/temporary-tree.ts";
import { repositoryRoot } from "#/tests/support/workspace.ts";

const manifest = "package.json";
const installed = "node_modules";
const kitTraces = ["<!-- solid2-agent-kit:", `${kitBin} hook`];
const filesTheKitEdits = ["AGENTS.md", ".claude/settings.json"];
const settingsFile = ".claude/settings.json";
const settingsKeys = ["enabledPlugins", "env", "extraKnownMarketplaces"];
const enabledPlugins = {
  "pstack@cursor-plugins": true,
  "modern-web-guidance@googlechrome": true,
};
const marketplaces = {
  "cursor-plugins": { source: { source: "github", repo: "cursor/plugins" } },
  googlechrome: { source: { source: "github", repo: "GoogleChrome/modern-web-guidance" } },
};
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
  const problems = kitSkillNames(repositoryRoot).flatMap((name) => {
    const copy = join(repositoryRoot, sharedSkills, name);
    const link = join(repositoryRoot, claudeSkills, name);
    return [
      ...(existsSync(copy) &&
      folderHash(copy) === folderHash(join(repositoryRoot, kitSkillSource, name))
        ? []
        : [`${sharedSkills}/${name}: it is not what the kit ships. Run node ${copyScript}.`]),
      ...(existsSync(link) &&
      lstatSync(link).isSymbolicLink() &&
      readlinkSync(link) === `../../${sharedSkills}/${name}`
        ? []
        : [
            `${claudeSkills}/${name}: make it a link to ../../${sharedSkills}/${name}. Run node ${copyScript}.`,
          ]),
    ];
  });

  expect(kitSkillNames(repositoryRoot).length).toBeGreaterThan(0);
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
  const shared = kitSkillNames(repositoryRoot).map((name) => `${claudeSkills}/${name}/`);
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

test(`${settingsFile} holds only the plugins, their marketplaces and the environment, and so no hook, and enables exactly the plugins this project names, from exactly their marketplaces and sources`, () => {
  const settings = JSON.parse(read(settingsFile));

  expect(Object.keys(settings).sort()).toEqual(settingsKeys);
  expect(settings.enabledPlugins).toEqual(enabledPlugins);
  expect(settings.extraKnownMarketplaces).toEqual(marketplaces);
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

test("kitSkills in scripts/package-skills.ts names exactly the skills the kit ships", () => {
  expect([...kitSkills].sort()).toEqual(kitSkillNames(repositoryRoot).sort());
});

function committed(root: string): void {
  for (const args of [
    ["init", "--quiet"],
    ["add", "--all"],
    ["-c", "user.name=test", "-c", "user.email=test@example.com", "commit", "--quiet", "-m", "a"],
  ]) {
    execFileSync("git", args, { cwd: root });
  }
}

function formerKitCopy(name: string): Record<string, string> {
  return { [`${sharedSkills}/${name}/SKILL.md`]: `the kit's ${name}` };
}

function linkedFromClaude(root: string, name: string): void {
  mkdirSync(join(root, claudeSkills), { recursive: true });
  symlinkSync(`../../${sharedSkills}/${name}`, join(root, claudeSkills, name));
}

function shippedByTheKit(names: readonly string[]): Record<string, string> {
  return Object.fromEntries(
    names.map((name) => [`${kitSkillSource}/${name}/SKILL.md`, `the kit's ${name}`]),
  );
}

test(`${copyScript} removes a skill it copied before that the kit no longer ships, with its link, and leaves the project's own skills`, async () => {
  await inTemporaryTree(
    {
      ...shippedByTheKit(["renamed"]),
      ...formerKitCopy("former"),
      [`${sharedSkills}/own/SKILL.md`]: "the project's own",
    },
    (root) => {
      linkedFromClaude(root, "former");
      committed(root);

      expect(copyKitSkills(root, ["former"])).toEqual(["renamed"]);
      expect(readdirSync(join(root, sharedSkills)).sort()).toEqual(["own", "renamed"]);
      expect(readdirSync(join(root, claudeSkills))).toEqual(["renamed"]);
      expect(readFileSync(join(root, sharedSkills, "own/SKILL.md"), "utf8")).toBe(
        "the project's own",
      );
    },
  );
});

test(`${copyScript} never removes a folder git does not hold as committed: a former kit copy the project has edited in place, or a new skill under a former kit name`, async () => {
  await inTemporaryTree({ ...shippedByTheKit(["renamed"]), ...formerKitCopy("former") }, (root) => {
    linkedFromClaude(root, "former");
    committed(root);
    writeFileSync(join(root, sharedSkills, "former/SKILL.md"), "the project's own, uncommitted");

    expect(() => copyKitSkills(root, ["former"])).toThrow(
      `${sharedSkills}/former: git does not hold it as committed, so it may be the project's.`,
    );
    expect(readFileSync(join(root, sharedSkills, "former/SKILL.md"), "utf8")).toBe(
      "the project's own, uncommitted",
    );
    expect(existsSync(join(root, sharedSkills, "renamed"))).toBe(false);
  });
  await inTemporaryTree(shippedByTheKit(["renamed"]), (root) => {
    committed(root);
    mkdirSync(join(root, sharedSkills, "former"), { recursive: true });
    writeFileSync(join(root, sharedSkills, "former/SKILL.md"), "the project's new skill");

    expect(() => copyKitSkills(root, ["former"])).toThrow(
      `${sharedSkills}/former: git does not hold it as committed, so it may be the project's.`,
    );
    expect(readFileSync(join(root, sharedSkills, "former/SKILL.md"), "utf8")).toBe(
      "the project's new skill",
    );
  });
});

test(`${copyScript} refuses a skill the kit ships under the name of a skill the project holds, its own or a package's, and changes nothing`, async () => {
  const projectSkill = { [`${sharedSkills}/own/SKILL.md`]: "the project's own" };
  await inTemporaryTree({ ...shippedByTheKit(["own"]), ...projectSkill }, (root) => {
    expect(() => copyKitSkills(root, [])).toThrow(
      `${sharedSkills}/own: the kit ships a skill of this name, and it is the project's.`,
    );
    expect(readFileSync(join(root, sharedSkills, "own/SKILL.md"), "utf8")).toBe(
      "the project's own",
    );
  });
  await inTemporaryTree(shippedByTheKit(["packaged"]), (root) => {
    mkdirSync(join(root, claudeSkills), { recursive: true });
    symlinkSync(
      "../../node_modules/a-package/skills/packaged",
      join(root, claudeSkills, "packaged"),
    );

    expect(() => copyKitSkills(root, [])).toThrow(
      `${claudeSkills}/packaged: the kit ships a skill of this name, and it is the project's.`,
    );
    expect(readlinkSync(join(root, claudeSkills, "packaged"))).toBe(
      "../../node_modules/a-package/skills/packaged",
    );
    expect(existsSync(join(root, sharedSkills, "packaged"))).toBe(false);
  });
});
