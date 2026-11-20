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
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { expect, test } from "vite-plus/test";
import {
  kitInstalls,
  kitPackage,
  kitVersion,
  claudeSkills,
  sharedSkills,
  readSettings,
  settingsFile,
  syncAgentKit,
  syncScript,
} from "#/scripts/agent-kit.ts";
import { manifestPaths } from "#/scripts/repository.ts";
import { approvedSkills } from "#/scripts/package-skills.ts";
import { pnpmSettings, workspaceFile } from "#/scripts/pnpm-settings.ts";
import { inTemporaryTree } from "#/tests/support/temporary-tree.ts";
import { repositoryRoot } from "#/tests/support/workspace.ts";

const manifest = "package.json";
const lintScript = "lint:solid";
const solidReview = ".agents/skills/verify-solid2/SKILL.md";
const reviewChecklist = "Review checklist";
const runBlock = /^## Run it\n\n```bash\n([\s\S]*?)\n```/m;
const kitCommands = ".claude/commands";
const catalogVersion = "catalog:";
const claudeDocument = "CLAUDE.md";
const kitMarker = "solid2-agent-kit:";
const removedByPnpm = "-";
const neededByStorybook = "react";
const bannedFinding = "dep-";
const solidOneLine = "the Solid 1.x line";
const installed = "node_modules";
const replacedByTheKit = [
  { pack: "solid-js", name: "solid-2.0" },
  { pack: "solid-js", name: "solid-2.0-cheatsheet" },
];
const openPullRequest = ".agents/skills/open-pull-request/SKILL.md";
const reviewStep = /^(## 4\. [\s\S]*?)(?=^## )/m;

function read(path: string): string {
  return readFileSync(join(repositoryRoot, path), "utf8");
}

function filesIn(root: string, directory = ""): string[] {
  return readdirSync(join(root, directory), { withFileTypes: true }).flatMap((entry) => {
    const path = directory === "" ? entry.name : `${directory}/${entry.name}`;
    return entry.isDirectory() ? filesIn(root, path) : [path];
  });
}

function contentOf(root: string, path: string): string {
  const file = join(root, path);
  const entry = lstatSync(file);
  if (entry.isSymbolicLink()) return `a link to ${readlinkSync(file)}`;
  return entry.isDirectory() ? "a directory" : readFileSync(file, "utf8");
}

function copyInto(root: string, path: string): void {
  const from = join(repositoryRoot, path);
  mkdirSync(dirname(join(root, path)), { recursive: true });
  if (lstatSync(from).isSymbolicLink()) symlinkSync(readlinkSync(from), join(root, path));
  else cpSync(from, join(root, path), { recursive: true });
}

function seedCheckout(root: string, paths: readonly string[]): void {
  symlinkSync(join(repositoryRoot, installed), join(root, installed));
  for (const path of [manifest, ...paths].filter((file) =>
    existsSync(join(repositoryRoot, file)),
  )) {
    copyInto(root, path);
  }
}

test(`the guidance the kit installs for Claude Code is exactly what ${syncScript} writes with the kit the catalog pins`, async () => {
  const outputs = await inTemporaryTree({}, (root) => {
    seedCheckout(root, []);
    syncAgentKit(root);
    return filesIn(root).filter((path) => path !== manifest && path !== installed);
  });
  const inKitDirectories = kitInstalls(repositoryRoot, "skills")
    .flatMap((name) => [`${sharedSkills}/${name}`, `${claudeSkills}/${name}`])
    .filter((path) => existsSync(join(repositoryRoot, path)))
    .flatMap((path) =>
      lstatSync(join(repositoryRoot, path)).isDirectory() ? filesIn(repositoryRoot, path) : [path],
    );
  const synced = await inTemporaryTree({}, (root) => {
    seedCheckout(root, outputs);
    syncAgentKit(root);
    return new Map(outputs.map((path) => [path, contentOf(root, path)]));
  });
  const stale = [...new Set([...outputs, ...inKitDirectories])]
    .filter(
      (path) =>
        !existsSync(join(repositoryRoot, path)) ||
        synced.get(path) !== contentOf(repositoryRoot, path),
    )
    .map(
      (path) =>
        `${path}: it is not what node ${syncScript} writes with solid2-agent-kit ${kitVersion(repositoryRoot)}, the release the catalog pins. Run it and commit what it writes; change the kit's guidance only through the kit.`,
    );

  expect(outputs).not.toContain(settingsFile);
  expect(outputs).toContain(`${claudeSkills}/${kitInstalls(repositoryRoot, "skills")[0]}`);
  expect(stale).toEqual([]);
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

test(`step 4 of open-pull-request runs ${solidReview}, which runs the kit's gates as vp run ${lintScript} and walks the kit's review checklist, and no agent has a command of the kit's`, () => {
  const step = reviewStep.exec(read(openPullRequest))?.[1] ?? "";
  const review = existsSync(join(repositoryRoot, solidReview)) ? read(solidReview) : "";
  const lintSolid: unknown = Reflect.get(JSON.parse(read(manifest)).scripts ?? {}, lintScript);
  const kitSkill = `${sharedSkills}/${kitInstalls(repositoryRoot, "skills")[0]}/SKILL.md`;

  expect(step).toContain("Thermos");
  expect(step).toContain(`\`${solidReview}\``);
  expect(runBlock.exec(review)?.[1]?.split("\n")).toContain(`vp run ${lintScript}`);
  expect(lintSolid).toMatch(/^solid2-kit check --dir \. && solid2-kit doctor$/);
  expect(review).toContain(`\`${kitSkill}\``);
  expect(review).toContain(reviewChecklist);
  expect(
    read(kitSkill)
      .split("\n")
      .some((line) => line.startsWith(`## ${reviewChecklist}`)),
  ).toBe(true);
  expect(existsSync(join(repositoryRoot, kitCommands))).toBe(false);
});

type DoctorFinding = { id: string; message: string };

async function kitDoctor(): Promise<{
  banned: string[];
  findingsIn: (root: string) => DoctorFinding[];
}> {
  const doctor: unknown = await import(
    pathToFileURL(join(repositoryRoot, kitPackage, "bin/doctor.mjs")).href
  );
  const findings: unknown = Reflect.get(Object(doctor), "doctorFindings");
  if (typeof findings !== "function") throw new Error("the kit's doctor has no doctorFindings.");
  return {
    banned: Object.keys(Object(Reflect.get(Object(doctor), "BANNED_DEPS"))),
    findingsIn: (root) => Reflect.apply(findings, undefined, [root]),
  };
}

test(`${workspaceFile} has pnpm remove from any install every package the kit's doctor bans, but react, which Storybook's icons need`, async () => {
  const { banned } = await kitDoctor();
  const { overrides } = pnpmSettings();
  const removed = Object.keys(overrides).filter((name) => overrides[name] === removedByPnpm);

  expect(removed.sort()).toEqual(banned.filter((name) => name !== neededByStorybook).sort());
});

test("no workspace manifest lists a package the kit's doctor bans, or a Solid 1.x line, in any dependency list", async () => {
  const { findingsIn } = await kitDoctor();
  const { catalog } = pnpmSettings();
  const pinned = (versions: Record<string, string> | undefined) =>
    Object.fromEntries(
      Object.entries(versions ?? {}).map(([name, version]) => [
        name,
        version === catalogVersion ? (catalog[name] ?? version) : version,
      ]),
    );
  const problems = await Promise.all(
    manifestPaths().map((path) =>
      inTemporaryTree({}, (root) => {
        const lists = JSON.parse(read(path)) as Record<string, Record<string, string>>;
        writeFileSync(
          join(root, manifest),
          JSON.stringify({
            dependencies: pinned(lists.dependencies),
            devDependencies: {
              ...pinned(lists.optionalDependencies),
              ...pinned(lists.peerDependencies),
              ...pinned(lists.devDependencies),
            },
          }),
        );
        return findingsIn(root)
          .filter(
            ({ id, message }) => id.startsWith(bannedFinding) || message.includes(solidOneLine),
          )
          .map(({ message }) => `${path}: ${message}`);
      }),
    ),
  );

  expect(manifestPaths().length).toBeGreaterThan(1);
  expect(problems.flat()).toEqual([]);
});

test(`${settingsFile} runs no hook, so every rule holds for every agent through the git hooks and CI`, () => {
  expect(readSettings(repositoryRoot).hooks ?? {}).toEqual({});
});

test(`AGENTS.md is the one agent document, and holds rules only: there is no ${claudeDocument}, AGENTS.md holds none of the kit's prose, and ${syncScript} writes neither`, async () => {
  const written = await inTemporaryTree({}, (root) => {
    seedCheckout(root, ["AGENTS.md"]);
    syncAgentKit(root);
    return {
      claudeDocument: existsSync(join(root, claudeDocument)),
      agents: contentOf(root, "AGENTS.md"),
    };
  });

  expect(existsSync(join(repositoryRoot, claudeDocument))).toBe(false);
  expect(read("AGENTS.md")).not.toContain(kitMarker);
  expect(written).toEqual({ claudeDocument: false, agents: read("AGENTS.md") });
});
