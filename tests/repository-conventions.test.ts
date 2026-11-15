import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  lstatSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  realpathSync,
} from "node:fs";
import { basename, join, relative, sep } from "node:path";
import { expect, test } from "vite-plus/test";
import { engineNames } from "../scripts/browser-engines.mjs";
import {
  catalogVersions,
  repositoryRoot,
  rootManifest,
  workflowFiles,
  workspaceFile,
} from "./support/workspace";
import { pnpmSettings } from "../scripts/pnpm-settings";

const skillsDirectory = join(repositoryRoot, ".agents/skills");
const linkedSkillsDirectory = join(repositoryRoot, ".claude/skills");
const agentsDirectory = join(repositoryRoot, ".claude/agents");
const agentPathInBackticks = /`(\.(?:agents|claude)\/[^`*\s]+)`/g;
const trailingPunctuation = /[:.,]$/;
const verifyWithPrivateTerms =
  /- run: vp run verify\n\s+env:\n\s+SOLIX_PRIVATE_TERMS: \$\{\{ secrets\.SOLIX_PRIVATE_TERMS \}\}$/m;
const pathInBackticks = /`((?:packages|apps|tests|scripts|docs|\.agents|\.github)\/[^`:*\s]+)`/g;
const fileInBackticks = /`([\w./-]+\/[\w.-]+\.(?:ts|tsx|mjs|yml|json|md))`/g;
const notOneSpaceAtACellBorder = / {2,}\||\| {2,}|\S\||\|\S/;
const confirmedCommit = /Last confirmed against commit `([0-9a-f]{7,40})`/;
const diffPathList = /Run `git diff [0-9a-f]{7,40} -- ([^`]+)`/;
const backticked = /`([^`]+)`/g;
const checkoutSteps = /- uses: actions\/checkout@/g;
const fullHistory = /^\s+fetch-depth: 0$/gm;
const versionPrefix = /^[\^~]/;

const reviewedSkillsFile = "scripts/reviewed-skills.json";
const packageSkillIgnoreFile = ".gitignore";
const skillDirectories = [".agents/skills", ".claude/skills"];
const skillFolders = skillDirectories.join(" and ");
const installed = existsSync(join(repositoryRoot, "node_modules/.modules.yaml"));
const approvedSkills = Object.entries(pnpmSettings().approvedSkills).flatMap(([pack, names]) =>
  names.map((name) => ({ pack, name })),
);
const reviewedHashes = JSON.parse(
  readFileSync(join(repositoryRoot, reviewedSkillsFile), "utf8"),
) as Record<string, Record<string, string>>;
const packageSkillEntries = [packageSkillIgnoreFile, ...approvedSkills.map(({ name }) => name)];

const skillNames = readdirSync(skillsDirectory)
  .filter((name) => !packageSkillEntries.includes(name))
  .sort();

function escapeForRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function skillText(name: string): string {
  const file = join(skillsDirectory, name, "SKILL.md");
  return existsSync(file) ? readFileSync(file, "utf8") : "";
}

function read(path: string): string {
  return readFileSync(join(repositoryRoot, path), "utf8");
}

function frontMatterOf(text: string): Record<string, string> {
  const block = /^---\n([\s\S]*?)\n---\n/.exec(text)?.[1] ?? "";
  return Object.fromEntries(
    block
      .split("\n")
      .map((line) => /^([a-z-]+): (.*)$/.exec(line))
      .filter((match): match is RegExpExecArray => match !== null)
      .map(([, key, value]) => [key, value]),
  );
}

test("every skill is named for its directory, described, and linked from .claude/skills", () => {
  const violations = skillNames.flatMap((name) => {
    const file = join(skillsDirectory, name, "SKILL.md");
    const problems: string[] = [];
    if (!existsSync(file)) return [`.agents/skills/${name}: add a SKILL.md.`];
    const front = frontMatterOf(readFileSync(file, "utf8"));
    if (front.name !== name)
      problems.push(
        `.agents/skills/${name}/SKILL.md: name must be "${name}", not "${front.name}".`,
      );
    if (!front.description)
      problems.push(`.agents/skills/${name}/SKILL.md: add a description that says when to use it.`);
    const link = join(linkedSkillsDirectory, name);
    const linked =
      existsSync(link) &&
      lstatSync(link).isSymbolicLink() &&
      readlinkSync(link) === `../../.agents/skills/${name}`;
    if (!linked)
      problems.push(
        `.claude/skills/${name}: make it a symbolic link to ../../.agents/skills/${name}.`,
      );
    return problems;
  });
  const dangling = readdirSync(linkedSkillsDirectory)
    .filter((name) => !skillNames.includes(name) && !packageSkillEntries.includes(name))
    .map((name) => `.claude/skills/${name}: remove it, there is no .agents/skills/${name}.`);

  expect(skillNames.length).toBeGreaterThan(0);
  expect([...violations, ...dangling]).toEqual([]);
});

function trackedFiles(directory: string): string[] {
  return spawnSync("git", ["ls-files", "--", directory], { cwd: repositoryRoot, encoding: "utf8" })
    .stdout.split("\n")
    .filter((line) => line !== "");
}

function isIgnored(path: string): boolean {
  return spawnSync("git", ["check-ignore", "-q", path], { cwd: repositoryRoot }).status === 0;
}

function skillFolderContent(directory: string): { hash: string; symbolicLinks: string[] } {
  const root = realpathSync(directory);
  const hash = createHash("sha256");
  const entries = readdirSync(root, { recursive: true, withFileTypes: true }).map((entry) => ({
    entry,
    path: relative(root, join(entry.parentPath, entry.name)).split(sep).join("/"),
  }));
  const files = entries
    .filter(({ entry }) => entry.isFile())
    .map(({ path }) => path)
    .sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
  for (const path of files) {
    hash.update(`${path}\0`);
    hash.update(readFileSync(join(root, path)));
    hash.update("\0");
  }
  return {
    hash: hash.digest("hex"),
    symbolicLinks: entries.filter(({ entry }) => entry.isSymbolicLink()).map(({ path }) => path),
  };
}

test(`${reviewedSkillsFile} records a reviewed hash for exactly the package skills ${workspaceFile} approves`, () => {
  const recorded = Object.entries(reviewedHashes).flatMap(([pack, skills]) =>
    Object.keys(skills).map((name) => `${pack} ${name}`),
  );
  const approved = approvedSkills.map(({ pack, name }) => `${pack} ${name}`);
  const violations = [
    ...approved
      .filter((entry) => !recorded.includes(entry))
      .map(
        (entry) =>
          `${reviewedSkillsFile}: record the reviewed hash of ${entry}, which ${workspaceFile} approves.`,
      ),
    ...recorded
      .filter((entry) => !approved.includes(entry))
      .map(
        (entry) =>
          `${reviewedSkillsFile}: remove ${entry}, which ${workspaceFile} does not approve.`,
      ),
  ];

  expect(violations).toEqual([]);
});

test(`in ${skillFolders}, git ignores the approved package skills and tracks every other entry`, () => {
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
      ...approvedSkills
        .filter(({ name }) => isTracked(name))
        .map(
          ({ pack, name }) =>
            `${directory}/${name}: a project skill has the name of the skill ${pack} ships and ${workspaceFile} approves. Rename one of them.`,
        ),
      ...approvedSkills
        .filter(({ name }) => !isTracked(name) && !isIgnored(`${directory}/${name}`))
        .map(
          ({ name }) =>
            `${directory}/${name}: let pnpm's ${packageSkillIgnoreFile} there ignore it; run vp install and commit that file.`,
        ),
      ...entries
        .filter((entry) => !approvedSkills.some(({ name }) => name === entry))
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
    const violations = skillDirectories.flatMap((directory) => {
      const linkedToPackages = readdirSync(join(repositoryRoot, directory)).filter((entry) => {
        const path = join(repositoryRoot, directory, entry);
        return lstatSync(path).isSymbolicLink() && readlinkSync(path).includes("node_modules/");
      });
      return [
        ...linkedToPackages
          .filter((entry) => !approvedSkills.some(({ name }) => name === entry))
          .map(
            (entry) =>
              `${directory}/${entry}: it links a package skill that ${workspaceFile} does not approve. Remove the link, or read the skill and approve it there by name.`,
          ),
        ...approvedSkills.flatMap(({ pack, name }) => {
          const link = join(repositoryRoot, directory, name);
          const target = existsSync(link) ? readlinkSync(link) : "";
          if (!target.includes(`/node_modules/${pack}/skills/${name}`)) {
            return [
              `${directory}/${name}: pnpm has not linked ${pack}'s skill ${name} here. Run vp install.`,
            ];
          }
          const front = frontMatterOf(readFileSync(join(link, "SKILL.md"), "utf8"));
          const { hash, symbolicLinks } = skillFolderContent(link);
          const reviewed = reviewedHashes[pack]?.[name];
          return [
            ...(front.name === name
              ? []
              : [`${directory}/${name}/SKILL.md: ${pack} names this skill "${front.name}".`]),
            ...symbolicLinks.map(
              (path) =>
                `${directory}/${name}/${path}: ${pack} ships a symbolic link inside this skill, whose text a hash cannot hold. Do not approve the skill until it ships files only.`,
            ),
            ...(hash === reviewed
              ? []
              : [
                  `${directory}/${name}: ${pack} ${reviewed === undefined ? "ships this skill with no reviewed hash" : "changed the files of this skill"}. Read every file of it, hidden ones included, as data, then record its hash, ${hash}, in ${reviewedSkillsFile}.`,
                ]),
          ];
        }),
      ];
    });

    expect(violations).toEqual([]);
  },
);

test("every .agents or .claude path that a project-owned skill names exists", () => {
  const vendored = Object.keys(
    (JSON.parse(read("skills-lock.json")) as { skills: Record<string, unknown> }).skills,
  );
  const projectOwned = skillNames.filter((name) => !vendored.includes(name));
  const violations = projectOwned.flatMap((name) =>
    [...skillText(name).matchAll(agentPathInBackticks)]
      .map(([, path]) => path.replace(trailingPunctuation, ""))
      .filter((path) => !existsSync(join(repositoryRoot, path)))
      .map(
        (path) =>
          `.agents/skills/${name}/SKILL.md: ${path} does not exist. A vendored skill may have been renamed upstream; point at its new path.`,
      ),
  );

  expect(projectOwned.length).toBeGreaterThan(0);
  expect(violations).toEqual([]);
});

test("every agent is named for its file and is started by an installed skill", () => {
  const agentFiles = readdirSync(agentsDirectory).filter((file) => file.endsWith(".md"));
  const skillTexts = skillNames
    .map((name) => join(skillsDirectory, name, "SKILL.md"))
    .filter((file) => existsSync(file))
    .map((file) => readFileSync(file, "utf8"));
  const violations = agentFiles.flatMap((file) => {
    const name = basename(file, ".md");
    const problems: string[] = [];
    const front = frontMatterOf(readFileSync(join(agentsDirectory, file), "utf8"));
    if (front.name !== name)
      problems.push(`.claude/agents/${file}: name must be "${name}", not "${front.name}".`);
    const startedBy = new RegExp(`subagent_type:\\s*["\`]?${escapeForRegExp(name)}(?![\\w-])`);
    if (!skillTexts.some((text) => startedBy.test(text)))
      problems.push(
        `.claude/agents/${file}: no skill in .agents/skills starts it with subagent_type: "${name}". Remove the agent, or install the skill that starts it.`,
      );
    return problems;
  });

  expect(agentFiles.length).toBeGreaterThan(0);
  expect(violations).toEqual([]);
});

test("every file a verification skill's covered-code table names exists", () => {
  const violations = skillNames
    .filter((name) => name.startsWith("verify-"))
    .flatMap((name) => {
      const text = readFileSync(join(skillsDirectory, name, "SKILL.md"), "utf8");
      const tableRows = text.split("\n").filter((line) => line.startsWith("|"));
      return tableRows
        .flatMap((row) => [...row.matchAll(pathInBackticks)].map(([, path]) => path))
        .filter((path) => !existsSync(join(repositoryRoot, path)))
        .map(
          (path) =>
            `.agents/skills/${name}/SKILL.md: the table names ${path}, which does not exist. Update the skill with the rename.`,
        );
    });

  expect(violations).toEqual([]);
});

test("every verification skill says which commit it was last confirmed against", () => {
  const violations = skillNames
    .filter((name) => name.startsWith("verify-") && name !== "verify-playground")
    .filter(
      (name) =>
        !/Last confirmed against commit `[0-9a-f]{7,40}`/.test(
          readFileSync(join(skillsDirectory, name, "SKILL.md"), "utf8"),
        ),
    )
    .map(
      (name) => `.agents/skills/${name}/SKILL.md: add "Last confirmed against commit \`<hash>\`."`,
    );

  expect(violations).toEqual([]);
});

function coveredPathsOf(text: string): string[] {
  return text
    .split("\n")
    .filter((line) => line.startsWith("| ") && !line.startsWith("| ---"))
    .slice(1)
    .flatMap((row) => [...(row.split(" | ")[0] ?? "").matchAll(backticked)].map(([, path]) => path))
    .filter((path) => existsSync(join(repositoryRoot, path)));
}

function covers(listed: string, path: string): boolean {
  return path === listed || path.startsWith(`${listed}/`);
}

test("every path a verification skill tells you to diff is in its covered-code table, and every path in the table is in the diff", () => {
  const violations = skillNames
    .filter((name) => name.startsWith("verify-"))
    .flatMap((name) => {
      const text = skillText(name);
      const listed = diffPathList.exec(text)?.[1]?.split(" ") ?? [];
      if (listed.length === 0) return [];
      const covered = coveredPathsOf(text);
      return [
        ...covered
          .filter((path) => !listed.some((entry) => covers(entry, path)))
          .map(
            (path) =>
              `.agents/skills/${name}/SKILL.md: the table covers ${path}, which the git diff command leaves out.`,
          ),
        ...listed
          .filter((entry) => !covered.some((path) => covers(entry, path)))
          .map(
            (entry) =>
              `.agents/skills/${name}/SKILL.md: the git diff command names ${entry}, which no row of the table covers.`,
          ),
      ];
    });

  expect(violations).toEqual([]);
});

function ancestryOf(commit: string): "ancestor" | "not an ancestor" | "unknown" {
  const { status } = spawnSync("git", ["merge-base", "--is-ancestor", commit, "HEAD"], {
    cwd: repositoryRoot,
    stdio: "ignore",
  });
  if (status === 0) return "ancestor";
  return status === 1 ? "not an ancestor" : "unknown";
}

test("every verification skill was last confirmed against a commit that HEAD contains, and CI checks out the history to tell", () => {
  const violations = skillNames
    .filter((name) => name.startsWith("verify-"))
    .flatMap((name) => {
      const commit = confirmedCommit.exec(skillText(name))?.[1];
      if (commit === undefined) return [];
      const ancestry = ancestryOf(commit);
      if (ancestry === "ancestor") return [];
      return [
        ancestry === "unknown"
          ? `.agents/skills/${name}/SKILL.md: it was last confirmed against ${commit}, which this clone does not hold. Name a commit of this branch.`
          : `.agents/skills/${name}/SKILL.md: it was last confirmed against ${commit}, which HEAD does not contain. Confirm the skill against a commit of this branch and name that one.`,
      ];
    });
  const shallow = workflowFiles
    .filter((file) => {
      const text = read(file);
      return (text.match(fullHistory) ?? []).length < (text.match(checkoutSteps) ?? []).length;
    })
    .map(
      (file) =>
        `${file}: give every actions/checkout step \`fetch-depth: 0\`, so the tests can tell whether a skill's commit is in the history.`,
    );

  expect([...violations, ...shallow]).toEqual([]);
});

test("no project-owned skill copies a version from the catalog", () => {
  const vendored = Object.keys(
    (JSON.parse(read("skills-lock.json")) as { skills: Record<string, unknown> }).skills,
  );
  const versions = Object.entries(catalogVersions())
    .filter(([, version]) => !version.includes(":"))
    .map(([name, version]): [string, string] => [name, version.replace(versionPrefix, "")]);
  const violations = skillNames
    .filter((name) => !vendored.includes(name))
    .flatMap((name) =>
      versions
        .filter(([, version]) => skillText(name).includes(version))
        .map(
          ([dependency, version]) =>
            `.agents/skills/${name}/SKILL.md: it copies ${version}, the version of ${dependency}. Point at the catalog in ${workspaceFile} instead, so an upgrade changes one line.`,
        ),
    );

  expect(versions.length).toBeGreaterThan(0);
  expect(violations).toEqual([]);
});

test("every file the rules table in AGENTS.md names exists", () => {
  const rows = read("AGENTS.md")
    .split("\n")
    .filter((line) => line.startsWith("|"));
  const violations = rows
    .flatMap((row) => [...row.matchAll(fileInBackticks)].map(([, path]) => path))
    .filter((path) => !existsSync(join(repositoryRoot, path)))
    .map((path) => `AGENTS.md: the table names ${path}, which does not exist.`);

  expect(rows.length).toBeGreaterThan(3);
  expect(violations).toEqual([]);
});

test("every row of the rules table in AGENTS.md is compact, so a rule edit changes one line", () => {
  const padded = read("AGENTS.md")
    .split("\n")
    .map((line, index) => ({ line, number: index + 1 }))
    .filter(({ line }) => line.startsWith("|") && notOneSpaceAtACellBorder.test(line))
    .map(({ number }) => `AGENTS.md:${number}`);

  expect(
    padded,
    "Write each row as `| Rule | Enforced by |`, with one space on each side of every |. Compact rows keep each rule edit to one line.",
  ).toEqual([]);
});

test("every check in the repository runs through vp run verify, before a commit and in CI", () => {
  const manifest = rootManifest;
  const verify = manifest.scripts?.verify ?? "";

  expect(verify.split(" && ")).toEqual([
    "vp check --deny-warnings",
    "vp run lint:solid",
    "vp run check:private-terms",
    "vp test",
  ]);
  expect(read(".vite-hooks/pre-commit").trim()).toBe("vp staged && vp run verify");
  const everyEngine = `playwright install --with-deps ${engineNames.join(" ")}`;
  for (const file of workflowFiles) {
    const workflow = read(file);
    const installs = workflow.split("\n").filter((line) => line.includes("playwright install"));
    if (/vp run (verify|evidence)/.test(workflow)) {
      expect(installs.length, `${file} installs the browser engines`).toBeGreaterThan(0);
    }
    if (/vp run verify/.test(workflow)) {
      expect(workflow, `${file} gives verify the private-term list`).toMatch(
        verifyWithPrivateTerms,
      );
    }
    for (const line of installs) {
      expect(line, `${file} installs every browser engine, as verify needs`).toContain(everyEngine);
    }
  }
  expect(read(".github/workflows/ci.yml")).toMatch(/- run: vp run verify$/m);
  expect(read("AGENTS.md")).toContain("`vp run verify`");
});
