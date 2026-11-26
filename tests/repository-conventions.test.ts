import { spawnSync } from "node:child_process";
import {
  existsSync,
  globSync,
  lstatSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, join, matchesGlob } from "node:path";
import { expect, test } from "vite-plus/test";
import { engineNames } from "#/scripts/browser-engines.mjs";
import { frontMatterOf, outsideSkills } from "#/scripts/package-skills.ts";
import { pnpmSettings } from "#/scripts/pnpm-settings.ts";
import {
  outsideGeneratedOrInstalled,
  repositoryRoot,
  rootManifest,
  trackedFiles,
  workflowFiles,
  workspaceFile,
} from "#/tests/support/workspace.ts";
import { inTemporaryTree } from "#/tests/support/temporary-tree.ts";
import { gitInScratchRepository } from "#/tests/support/git.ts";
import {
  descendants,
  exportsOf,
  parse,
  parseAll,
  parseText,
  ts,
  unwrapped,
} from "#/scripts/syntax.ts";
import { scriptFilesIn } from "#/scripts/repository.ts";
import { seedVariable } from "#/tests/support/property-seed.ts";
import { isModelFile, modelFilePatterns } from "#/scripts/formal-verification.ts";
import { formalSkillPrefix, verificationSkillPrefix } from "#/scripts/verification-skills.ts";
import { tlaTsRunsOf } from "#/tests/support/formal-verification.ts";
import { commandsOf, mutationEntriesOf } from "#/tests/support/skill-commands.ts";
import { nodeTestFiles } from "#/tests/support/project-setups.ts";

const skillsDirectory = join(repositoryRoot, ".agents/skills");
const linkedSkillsDirectory = join(repositoryRoot, ".claude/skills");
const agentsDirectory = join(repositoryRoot, ".claude/agents");
const verifyWithPrivateTerms =
  /- run: vp run verify\n\s+env:\n\s+SOLIX_PRIVATE_TERMS: \$\{\{ secrets\.SOLIX_PRIVATE_TERMS \}\}$/m;
const notOneSpaceAtACellBorder = / {2,}\||\| {2,}|\S\||\|\S/;
const confirmedCommit = /Last confirmed against commit `([0-9a-f]{7,40})`/;
const diffPathList = /Run `git diff [0-9a-f]{7,40} -- ([^`]+)`/;
const backticked = /`([^`]+)`/g;
const checkoutSteps = /- uses: actions\/checkout@/g;
const fullHistory = /^\s+fetch-depth: 0$/gm;
const versionPrefix = /^[\^~]/;

const packageSkillIgnoreFile = ".gitignore";
const packageSkillEntries = [
  packageSkillIgnoreFile,
  ...outsideSkills()
    .filter(({ source }) => source === "package")
    .map(({ name }) => name),
];

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

function copiedOutsideSkills(): string[] {
  return outsideSkills()
    .filter(({ source }) => source !== "package")
    .map(({ name }) => name);
}

function read(path: string): string {
  return readFileSync(join(repositoryRoot, path), "utf8");
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

const inBackticks = /`([^`\s]+)`/g;
const trailingMarks = /[:.,;…]+$/;
const pathSuffix = /(?::\d+(?:[-:]\d+)?|:[A-Za-z_$][\w$.]*|#[\w-]+)$/;
const notOnePath = /[*?{}<>[\]$]/;

function trackedTopLevelFolders(): string[] {
  return [
    ...new Set(
      trackedFiles()
        .filter((path) => path.includes("/"))
        .map((path) => `${path.slice(0, path.indexOf("/"))}/`),
    ),
  ];
}

function missingPathsOf(
  text: string,
  topLevelFolders: readonly string[],
  exists: (path: string) => boolean,
): string[] {
  const named = [...text.matchAll(inBackticks)].map(([, token]) =>
    token.replace(trailingMarks, "").replace(pathSuffix, ""),
  );
  return [...new Set(named)].filter(
    (path) =>
      topLevelFolders.some((folder) => path.startsWith(folder)) &&
      !notOnePath.test(path) &&
      !exists(path),
  );
}

function existsInTheRepository(path: string): boolean {
  return existsSync(join(repositoryRoot, path));
}

test("a path a skill or a rule names is checked when it starts with a folder git tracks at the top of the repository, after its line number, symbol or anchor, and a glob or a placeholder is no path", () => {
  const topLevelFolders = ["apps/", "packages/", "tests/"];
  const text = [
    "`tests/support/model.ts`, `apps/x/README.md`.",
    "`packages/a/src/b.ts:12`, `packages/a/src/b.ts:12-20`, `packages/a/src/b.ts:3:4`,",
    "`packages/a/src/b.ts#L10`, `packages/a/src/b.ts#L10-L20`, `packages/a/src/b.ts:` and `packages/a/src/b.ts...`;",
    "`packages/a/src/b.ts:declarable`, `packages/a/src/b.ts#usage`;",
    "`packages/*/src`, `tests/<file>.test.ts`, `packages/a/src/{a,b}.ts`, `tests/[name].ts`, `tests/$file.ts`;",
    "`docs/x.md` is under no tracked folder, and `vite.config.ts` and `preview.ts` are under no folder.",
  ].join("\n");
  const exists = (path: string) => path === "packages/a/src/b.ts";

  expect(missingPathsOf(text, topLevelFolders, exists)).toEqual([
    "tests/support/model.ts",
    "apps/x/README.md",
  ]);
});

test("every path a project-owned skill names in backticks under a folder git tracks at the top of the repository exists, so a step cannot name a file that moved or is gone", () => {
  const copied = copiedOutsideSkills();
  const projectOwned = skillNames.filter((name) => !copied.includes(name));
  const topLevelFolders = trackedTopLevelFolders();
  const violations = projectOwned.flatMap((name) =>
    missingPathsOf(skillText(name), topLevelFolders, existsInTheRepository).map(
      (path) => `.agents/skills/${name}/SKILL.md: ${path} does not exist. Point at its new path.`,
    ),
  );

  expect(projectOwned.length).toBeGreaterThan(0);
  expect(violations).toEqual([]);
});

const pathsTheTableForbids = [".claude/commands", ".claude/hooks"];

test("every path under a folder git tracks at the top of the repository that the rules table in AGENTS.md names exists, but for the paths it forbids, which it names and which do not exist", () => {
  const rows = read("AGENTS.md")
    .split("\n")
    .filter((line) => line.startsWith("|"));
  const table = rows.join("\n");
  const missing = missingPathsOf(table, trackedTopLevelFolders(), existsInTheRepository);
  const violations = [
    ...missing
      .filter((path) => !pathsTheTableForbids.includes(path))
      .map((path) => `AGENTS.md: the table names ${path}, which does not exist.`),
    ...pathsTheTableForbids
      .filter((path) => !table.includes(`\`${path}\``) || existsInTheRepository(path))
      .map(
        (path) =>
          `${path}: pathsTheTableForbids holds it, so the table must name it and it must not exist.`,
      ),
  ];

  expect(rows.length).toBeGreaterThan(3);
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

const namedSource = /`([\w./-]+\.(?:ts|tsx|mjs))`:/g;
const identifier = /^[A-Za-z_$][\w$]*$/;

function exportedNamesOf(file: string): string[] {
  const { functions, types, others } = exportsOf(parse(join(repositoryRoot, file)));
  return [...functions, ...types, ...others];
}

test("every name a verification skill's covered-code cell gives after a source file and a colon is exported by that file, so a rename or a move cannot leave the table naming what is gone", () => {
  const violations = skillNames
    .filter((name) => name.startsWith(verificationSkillPrefix))
    .flatMap((name) => {
      const text = readFileSync(join(skillsDirectory, name, "SKILL.md"), "utf8");
      const coveredCells = text
        .split("\n")
        .filter((line) => line.startsWith("| `"))
        .map((line) => line.slice(2).split(" | ")[0]);
      return coveredCells.flatMap((cell) => {
        const starts = [...cell.matchAll(namedSource)];
        return starts.flatMap((start, index) => {
          const file = start[1];
          if (!existsSync(join(repositoryRoot, file))) return [];
          const segment = cell.slice(
            (start.index ?? 0) + start[0].length,
            starts[index + 1]?.index ?? cell.length,
          );
          const exported = exportedNamesOf(file);
          return [...segment.matchAll(backticked)]
            .map(([, named]) => named)
            .filter((named) => identifier.test(named) && !exported.includes(named))
            .map(
              (named) =>
                `.agents/skills/${name}/SKILL.md: the covered-code cell names ${named} after ${file}, which does not export it. Name the file that does, or drop the name.`,
            );
        });
      });
    });

  expect(violations).toEqual([]);
});

type Skill = { name: string; text: string };

function readRepositoryFile(path: string): string | undefined {
  const file = join(repositoryRoot, path);
  return existsSync(file) && statSync(file).isFile() ? readFileSync(file, "utf8") : undefined;
}

function formalNamingProblems(
  skills: readonly Skill[],
  readFile: (path: string) => string | undefined,
): string[] {
  return skills.flatMap(({ name, text }) => {
    const runs = tlaTsRunsOf(text, readFile);
    const formal = name.startsWith(formalSkillPrefix);
    const where = `.agents/skills/${name}/SKILL.md`;
    const problems: string[] = [];
    if (runs.length > 0 && !formal)
      problems.push(
        `${where}: it runs tla-ts in \`${runs[0].line.trim()}\`, so it is formal verification. Name it ${formalSkillPrefix}${name.replace(verificationSkillPrefix, "")}.`,
      );
    if (formal && runs.length === 0)
      problems.push(
        `${where}: a ${formalSkillPrefix}* skill runs tla-ts in a fenced command, as \`npx tla-ts <model>\` or a script that imports from "tla-ts". Run it, or name the skill ${verificationSkillPrefix}*.`,
      );
    if (confirmedCommit.test(text) && !name.startsWith(verificationSkillPrefix))
      problems.push(
        `${where}: it records the commit it was last confirmed against, so it is a verification skill. Name it ${verificationSkillPrefix}*, or ${formalSkillPrefix}* if it runs tla-ts.`,
      );
    for (const run of runs.filter(({ kind, files }) => kind === "command" && files.length === 0))
      problems.push(
        `${where}: \`${run.line.trim()}\` runs tla-ts on no model. Give it the model file it checks.`,
      );
    for (const run of runs)
      for (const file of run.files.filter((each) => !isModelFile(each)))
        problems.push(
          run.kind === "command"
            ? `${where}: it gives tla-ts ${file}. Name the model ${modelFilePatterns.join(", ")}, so the pull request check asks for its chart.`
            : `${where}: it runs ${file}, which imports tla-ts. Name that script ${modelFilePatterns.join(", ")}, so the pull request check asks for its chart.`,
        );
    return problems;
  });
}

const plain = `${verificationSkillPrefix}tabs`;
const formal = `${formalSkillPrefix}tabs`;
const scripts: Record<string, string> = {
  "models/tabs.test.ts": 'import { check } from "tla-ts";\n',
  "models/deep.test.ts": 'import { check } from "tla-ts/check";\n',
  "models/lazy.test.ts": 'const { check } = await import("tla-ts");\n',
  "models/tabs.model.ts": 'import { check } from "tla-ts";\n',
  "models/required.test.ts": 'const { check } = require("tla-ts");\n',
  "models/bare.test.ts": 'import "tla-ts";\n',
  "tests/tabs.test.ts": 'import { test } from "vite-plus/test";\n',
};

test.each([
  ["runs npx tla-ts", plain, "npx tla-ts models/tabs.model.ts", `Name it ${formal}`],
  ["runs pnpm tla-ts", plain, "pnpm tla-ts models/Tabs.tla", `Name it ${formal}`],
  ["runs bunx tla-ts", plain, "bunx tla-ts models/Tabs.tla", `Name it ${formal}`],
  ["runs npx --yes tla-ts", plain, "npx --yes tla-ts models/Tabs.tla", `Name it ${formal}`],
  [
    "runs a test importing from tla-ts",
    plain,
    "vp test run models/tabs.test.ts",
    `Name it ${formal}`,
  ],
  [
    "runs a test importing tla-ts/check",
    plain,
    "vp test run models/deep.test.ts",
    `Name it ${formal}`,
  ],
  [
    'runs a test with import("tla-ts")',
    plain,
    "vp test run models/lazy.test.ts",
    `Name it ${formal}`,
  ],
  [
    "only names tla-ts in prose",
    formal,
    "vp test run tests/tabs.test.ts",
    "runs tla-ts in a fenced command",
  ],
  [
    "gives tla-ts a file that is no model",
    formal,
    "npx tla-ts models/tabs.ts",
    "it gives tla-ts models/tabs.ts",
  ],
  [
    "runs a script that is no model",
    formal,
    "vp test run models/tabs.test.ts",
    "it runs models/tabs.test.ts, which imports tla-ts",
  ],
  ["runs a versioned tla-ts", plain, "npx tla-ts@0.0.10 models/Tabs.tla", `Name it ${formal}`],
  [
    "runs tla-ts from node_modules/.bin",
    plain,
    "node_modules/.bin/tla-ts models/Tabs.tla",
    `Name it ${formal}`,
  ],
  [
    'runs a test with require("tla-ts")',
    plain,
    "vp test run models/required.test.ts",
    `Name it ${formal}`,
  ],
  [
    'runs a test with a bare import "tla-ts"',
    plain,
    "vp test run models/bare.test.ts",
    `Name it ${formal}`,
  ],
  ["runs tla-ts in a zsh block", plain, "zsh:npx tla-ts models/Tabs.tla", `Name it ${formal}`],
  [
    "gives tla-ts a quoted file that is no model",
    formal,
    'npx tla-ts "models/tabs.ts"',
    "it gives tla-ts models/tabs.ts",
  ],
  ["runs tla-ts on no file", formal, "npx tla-ts", "runs tla-ts on no model"],
])("the formal-verification naming rule fails a skill that %s", (_, name, written, said) => {
  const [fence, command] = written.startsWith("zsh:") ? ["zsh", written.slice(4)] : ["sh", written];
  const skill = { name, text: `Run tla-ts on the model.\n\`\`\`${fence}\n${command}\n\`\`\`\n` };

  expect(formalNamingProblems([skill], (path) => scripts[path]).join("\n")).toContain(said);
});

test("the formal-verification naming rule fails a skill confirmed against a commit but not named for verification, and passes a formal skill on a model and a plain one with no tla-ts", () => {
  const skills = [
    {
      name: formal,
      text: "```sh\nnpx tla-ts models/tabs.model.ts\nnode models/tabs.model.ts\nnpx tla-ts models/Tabs.tla -workers 4 -dump dot,actionlabels states.dot > out.txt\nnpx tla-ts models/Tabs.tla; echo done.txt\n```\n",
    },
    { name: plain, text: "No model checker, so tla-ts is not run.\n```sh\nvp test run\n```\n" },
  ];

  expect(
    formalNamingProblems(
      [{ name: "tabs-check", text: "Last confirmed against commit `0123abc`.\n" }],
      () => undefined,
    ).join("\n"),
  ).toContain(`Name it ${verificationSkillPrefix}*`);
  expect(formalNamingProblems(skills, (path) => scripts[path])).toEqual([]);
});

test(`a skill whose check runs tla-ts is named ${formalSkillPrefix}*, a ${formalSkillPrefix}* skill runs tla-ts on a model file, and every other verification skill is named ${verificationSkillPrefix}*`, () => {
  const skills = skillNames.map((name) => ({ name, text: skillText(name) }));

  expect(formalNamingProblems(skills, readRepositoryFile)).toEqual([]);
});

test.each([
  "packages/core/tests/tabs.model.test.ts",
  "packages/core/tests/tabs.model.test.tsx",
  "tests/tabs.model.test.ts",
  "tests/tabs.model.test.tsx",
])(
  "a model test that tla-ts checks through Vitest, such as %s, is both a model file and a file the node project runs",
  (modelTest) => {
    expect(isModelFile(modelTest)).toBe(true);
    expect(nodeTestFiles.some((pattern) => matchesGlob(modelTest, pattern))).toBe(true);
    expect(
      nodeTestFiles.some((pattern) => matchesGlob("packages/core/tests/tabs.model.ts", pattern)),
    ).toBe(false);
  },
);

test("every verification skill says which commit it was last confirmed against", () => {
  const violations = skillNames
    .filter((name) => name.startsWith(verificationSkillPrefix))
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

const runsAProperty = /\bassertProperty\(/;
const leadingDotSlash = /^\.\//;
const testOrStory = /\.(?:test|stories)\.(?:ts|tsx|mts)$/;

function testFiles(): string[] {
  return trackedFiles().filter((file) => testOrStory.test(file));
}

function mutationCommandProblems(
  name: string,
  text: string,
  files: readonly string[],
  read: (file: string) => string,
): string[] {
  const where = `.agents/skills/${name}/SKILL.md`;
  return mutationEntriesOf(text).flatMap(({ text: entry, commands }) => {
    const named = `the mutation entry "${entry.trim().slice(0, 60)}…"`;
    if (commands.length === 0) {
      return [
        `${where}: ${named} gives no \`vp test <files>\` command. Write the command it runs.`,
      ];
    }
    return commands.flatMap(({ written, seed, filters }) => {
      if (filters.length === 0) {
        return [
          `${where}: ${named} runs \`${written}\`, which names no file, so it runs every test of its projects. Name the files it runs.`,
        ];
      }
      const resolved = filters.map((filter) => {
        const sought = filter.replace(leadingDotSlash, "").toLowerCase();
        return files.filter((file) => file.toLowerCase().includes(sought));
      });
      const unmatched = filters.filter((_, index) => resolved[index].length === 0);
      if (unmatched.length > 0) {
        return [
          `${where}: ${named} runs \`${written}\`, whose ${unmatched.join(", ")} is in no test file's path.`,
        ];
      }
      const property = resolved.flat().some((file) => runsAProperty.test(read(file)));
      if (property && seed === undefined) {
        return [
          `${where}: ${named} runs \`${written}\`, which runs a generated property, with no \`${seedVariable}=<n>\`. Run it once without the variable, then write the command with a seed it failed with, so the check cannot pass by the luck of the draw.`,
        ];
      }
      if (!property && seed !== undefined) {
        return [
          `${where}: ${named} sets ${seedVariable} on \`${written}\`, which runs no generated property. Drop the variable.`,
        ];
      }
      return [];
    });
  });
}

test(`a mutation entry of any name and list marker runs \`vp test <files>\`, the files read as Vitest reads them, with \`${seedVariable}=<n>\` exactly when one of them runs a generated property`, () => {
  const fixtureFiles: Record<string, string> = {
    "packages/a/tests/a.test.ts": "await assertProperty(context, property);\n",
    "packages/b/tests/b.test.ts": 'test("fixed", () => {});\n',
  };
  const files = Object.keys(fixtureFiles);
  const readFixture = (file: string) => fixtureFiles[file] ?? "";
  const problems = (entry: string) => mutationCommandProblems(plain, entry, files, readFixture);
  const seeded = (filter: string) => `\`${seedVariable}=-42 vp test ${filter}\``;

  for (const refused of [
    "- Mutation check after editing covered code: run the command.",
    "- Late layout read mutation: run `vp test packages/a/tests/a.test.ts`.",
    "- Scroll mutation: change the line,\n  and run `vp test packages/a/tests/a.test.ts`.",
    '- Quoted mutation: run `vp test "packages/a/tests/a.test.ts"`.',
    "- Quoted mutation: run `vp test 'packages/a/tests/a.test.ts'`.",
    "- Substring mutation: run `vp test a.test`.",
    "* Starred mutation: run `vp test a.test`.",
    "1. Numbered mutation: run `vp test a.test`.",
    "- Steps:\n  - Nested mutation: run `vp test a.test`.",
    '- Project mutation: run `vp test --project "stories*"`.',
    `- Focus mutation: run ${seeded("packages/b/tests/b.test.ts")}.`,
    "- Focus mutation: run `vp test packages/c/tests/c.test.ts`.",
  ]) {
    expect(problems(refused), refused).toHaveLength(1);
  }
  for (const passed of [
    `- Scroll mutation: change the line,\n  and run ${seeded("packages/a/tests/a.test.ts")}.`,
    `* Quoted mutation: run ${seeded('"packages/a/tests/a.test.ts"')}.`,
    "1. Hydration mutation: run `vp test packages/b/tests/b.test.ts --project node`.",
    '- Story mutation: run `vp test --project "stories*" packages/b`.',
    `- Case mutation: run ${seeded("./Packages/A/tests/a.test.ts")}.`,
    "- Chained mutation: run `vp test packages/b/tests/b.test.ts && echo done`.",
  ]) {
    expect(problems(passed), passed).toEqual([]);
  }
  const tracked = testFiles();
  expect(
    skillNames
      .filter((name) => name.startsWith(verificationSkillPrefix))
      .flatMap((name) => mutationCommandProblems(name, skillText(name), tracked, read)),
  ).toEqual([]);
});

test("a skill's command line splits at a separator written alone or glued to a word, and a quoted separator stays a word", () => {
  expect(commandsOf('vp test -t ";" a.test.ts')).toEqual([["vp", "test", "-t", ";", "a.test.ts"]]);
  expect(commandsOf("vp test a.test.ts&&echo done|tee out.txt; ls")).toEqual([
    ["vp", "test", "a.test.ts"],
    ["echo", "done"],
    ["tee", "out.txt"],
    ["ls"],
  ]);
  expect(commandsOf("npx tla-ts 'models/My Tabs.tla' || true")).toEqual([
    ["npx", "tla-ts", "models/My Tabs.tla"],
    ["true"],
  ]);
});

const coveredCodeHeader = "Covered code";

function coveredPathsOf(text: string): string[] {
  const rows = text.split("\n").map((line) => (line.startsWith("| ") ? line : undefined));
  return rows
    .flatMap((row, index) => {
      if (row === undefined || row.startsWith("| ---")) return [];
      const header = rows.slice(0, index + 1).findLastIndex((line) => line === undefined) + 1;
      if (header === index) return [];
      const cells = (rows[header] ?? "").replace(/^\| | \|$/g, "").split(" | ");
      const column = Math.max(cells.indexOf(coveredCodeHeader), 0);
      return [...(row.split(" | ")[column] ?? "").matchAll(backticked)].map(([, path]) => path);
    })
    .filter((path) => existsSync(join(repositoryRoot, path)));
}

function coveredCellsOf(text: string): string[][] {
  const rows = text.split("\n").map((line) => (line.startsWith("| ") ? line : undefined));
  return rows.flatMap((row, index) => {
    if (row === undefined || row.startsWith("| ---")) return [];
    const header = rows.slice(0, index + 1).findLastIndex((line) => line === undefined) + 1;
    if (header === index) return [];
    const cells = (rows[header] ?? "").replace(/^\| | \|$/g, "").split(" | ");
    const column = cells.indexOf(coveredCodeHeader);
    if (column === -1) return [];
    return [[...(row.split(" | ")[column] ?? "").matchAll(backticked)].map(([, path]) => path)];
  });
}

function filesUnder(path: string): string[] {
  const matched = globSync(path, { cwd: repositoryRoot, exclude: outsideGeneratedOrInstalled });
  return matched.flatMap((found) =>
    statSync(join(repositoryRoot, found)).isDirectory()
      ? globSync(`${found}/**`, {
          cwd: repositoryRoot,
          exclude: outsideGeneratedOrInstalled,
        }).filter((file) => statSync(join(repositoryRoot, file)).isFile())
      : [found],
  );
}

test("every file a verification skill covers sits in one covered-code cell of its tables, so a change to it is described in one place", () => {
  const violations = skillNames
    .filter((name) => name.startsWith(verificationSkillPrefix))
    .flatMap((name) => {
      const cells = coveredCellsOf(skillText(name)).map((paths) => [
        ...new Set(paths.flatMap(filesUnder)),
      ]);
      const files = [...new Set(cells.flat())];
      return files.flatMap((file) => {
        const holding = cells.flatMap((cell, index) => (cell.includes(file) ? [index + 1] : []));
        return holding.length > 1
          ? [
              `.agents/skills/${name}/SKILL.md: ${file} sits in covered-code cells ${holding.join(" and ")}, counted down the tables. Describe it in one of them.`,
            ]
          : [];
      });
    });

  expect(violations).toEqual([]);
});

function covers(listed: string, path: string): boolean {
  return path === listed || path.startsWith(`${listed}/`);
}

test("every path a verification skill tells you to diff is in its covered-code table, and every path in the table is in the diff", () => {
  const violations = skillNames
    .filter((name) => name.startsWith(verificationSkillPrefix))
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

function gitStatus(directory: string, args: readonly string[]): number | null {
  return spawnSync("git", args, { cwd: directory, stdio: "ignore" }).status;
}

function ancestryOf(
  commit: string,
  directory: string = repositoryRoot,
): "ancestor" | "not an ancestor" | "unknown" {
  const merging = gitStatus(directory, ["rev-parse", "--verify", "--quiet", "MERGE_HEAD"]) === 0;
  const statuses = (merging ? ["HEAD", "MERGE_HEAD"] : ["HEAD"]).map((head) =>
    gitStatus(directory, ["merge-base", "--is-ancestor", commit, head]),
  );
  if (statuses.includes(0)) return "ancestor";
  return statuses.every((status) => status === 1) ? "not an ancestor" : "unknown";
}

test("while a merge is being committed, a commit that HEAD or the merged commit contains counts as one HEAD contains, and one only the merged commit contains stops counting once the merge is aborted", async () => {
  await inTemporaryTree({ "file.txt": "base\n" }, (root) => {
    const probe = (...args: string[]) => gitInScratchRepository(root, args).trim();
    probe("init", "--quiet", "--initial-branch=main");
    probe("add", "file.txt");
    probe("commit", "--quiet", "--message=base");
    probe("switch", "--quiet", "--create", "incoming");
    writeFileSync(join(root, "incoming.txt"), "incoming\n");
    probe("add", "incoming.txt");
    probe("commit", "--quiet", "--message=incoming");
    const incoming = probe("rev-parse", "HEAD");
    probe("switch", "--quiet", "main");
    writeFileSync(join(root, "file.txt"), "main\n");
    probe("commit", "--quiet", "--all", "--message=main");
    const own = probe("rev-parse", "HEAD");

    expect(ancestryOf(incoming, root)).toBe("not an ancestor");
    probe("merge", "--quiet", "--no-commit", "--no-ff", "incoming");
    expect(ancestryOf(incoming, root)).toBe("ancestor");
    expect(ancestryOf(own, root)).toBe("ancestor");
    probe("merge", "--abort");
    expect(ancestryOf(incoming, root)).toBe("not an ancestor");
  });
});

test("every verification skill was last confirmed against a commit that HEAD contains, or, while a merge is being committed, that the merged commit contains, and CI checks out the history to tell", () => {
  const violations = skillNames
    .filter((name) => name.startsWith(verificationSkillPrefix))
    .flatMap((name) => {
      const commit = confirmedCommit.exec(skillText(name))?.[1];
      if (commit === undefined) return [];
      const ancestry = ancestryOf(commit);
      if (ancestry === "ancestor") return [];
      return [
        ancestry === "unknown"
          ? `.agents/skills/${name}/SKILL.md: it was last confirmed against ${commit}, which this clone does not hold. Name a commit of this branch.`
          : `.agents/skills/${name}/SKILL.md: it was last confirmed against ${commit}, which neither HEAD nor, during a merge, the merged commit contains. Confirm the skill against a commit of this branch and name that one.`,
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
  const copied = copiedOutsideSkills();
  const versions = Object.entries(pnpmSettings().catalog)
    .filter(([, version]) => !version.includes(":"))
    .map(([name, version]): [string, string] => [name, version.replace(versionPrefix, "")]);
  const violations = skillNames
    .filter((name) => !copied.includes(name))
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

const childProcessRunners = ["execFileSync", "execFile", "spawn", "spawnSync"];
const packageManagerCommands = ["pm", "why"];
const mayRunVp = /\binstalledVp\b|["'`]vp["'`]/;

function calleeName(call: ts.CallExpression): string | undefined {
  const callee = unwrapped(call.expression);
  if (ts.isIdentifier(callee)) return callee.text;
  return ts.isPropertyAccessExpression(callee) ? callee.name.text : undefined;
}

function namesVp(expression: ts.Expression | undefined): boolean {
  if (expression === undefined) return false;
  const program = unwrapped(expression);
  return (
    (ts.isIdentifier(program) && program.text === "installedVp") ||
    (ts.isStringLiteralLikeNode(program) && program.text === "vp")
  );
}

function packageManagerCommandOf(expression: ts.Expression | undefined): string | undefined {
  if (expression === undefined) return undefined;
  const list = unwrapped(expression);
  const first = ts.isArrayLiteralExpression(list) ? list.elements[0] : undefined;
  return first !== undefined &&
    ts.isStringLiteralLikeNode(first) &&
    packageManagerCommands.includes(first.text)
    ? first.text
    : undefined;
}

function packageManagerBypassesIn(source: ts.SourceFile, file: string): string[] {
  return descendants(source).flatMap((node) => {
    if (!ts.isCallExpression(node)) return [];
    const name = calleeName(node);
    const [program, args] = node.arguments;
    const command = packageManagerCommandOf(args);
    if (
      name === undefined ||
      !childProcessRunners.includes(name) ||
      !namesVp(program) ||
      command === undefined
    ) {
      return [];
    }
    const line = source.getLineAndCharacterOfPosition(node.getStart()).line + 1;
    return [
      `${file}:${line}: ${name} runs vp ${command} itself; ask the package manager through askPackageManager in scripts/repository.ts, which picks the vp and checks its release.`,
    ];
  });
}

test("no script or test runs vp pm or vp why itself: each asks the package manager through askPackageManager", () => {
  const files = scriptFilesIn().filter((file) => mayRunVp.test(read(file)));

  expect(files).toContain("scripts/repository.ts");
  expect(
    parseAll(files.map((file) => join(repositoryRoot, file))).flatMap((source, index) =>
      packageManagerBypassesIn(source, files[index] ?? ""),
    ),
  ).toEqual([]);
});

test.for([
  ['execFileSync(installedVp, ["why", name])', 1],
  ['spawn("vp", ["pm", "pack"])', 1],
  ['childProcess.spawnSync("vp", ["why"] as const)', 1],
  ["execFile(`vp`, [`pm`, `config`])", 1],
  ['execFileSync(installedVp, ["fmt", file])', 0],
  ['execFileSync("vpx", ["pm"])', 0],
  ['askPackageManager(["why", name], options)', 0],
] as const)("the package-manager rule, on %s, finds %i bypass", ([call, found]) => {
  expect(packageManagerBypassesIn(parseText(`${call};\n`, ".ts"), "fixture.ts")).toHaveLength(
    found,
  );
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

test("every check in the repository runs through vp run verify, before a commit, before a merge commit and in CI", () => {
  const verify = rootManifest().scripts?.verify ?? "";

  expect(verify.split(" && ")).toEqual([
    "vp run check:lockfile",
    "vp check --deny-warnings",
    "vp run lint:solid",
    "vp run check:private-terms",
    "vp test",
  ]);
  expect(read(".vite-hooks/pre-commit").trim()).toBe(
    "node scripts/check-working-tree.ts && vp staged --no-stash && node scripts/check-working-tree.ts && vp run verify",
  );
  expect(read(".vite-hooks/pre-merge-commit").trim()).toBe(
    "node scripts/check-working-tree.ts && vp run verify",
  );
  const everyEngine = `playwright install --with-deps ${engineNames.join(" ")}`;
  for (const file of workflowFiles) {
    const workflow = read(file);
    const installs = workflow.split("\n").filter((line) => line.includes("playwright install"));
    if (/vp run verify/.test(workflow)) {
      expect(installs.length, `${file} installs the browser engines`).toBeGreaterThan(0);
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

test("the process that runs the global setups and starts the test workers has no GIT_ variable, and a child that a test worker starts with the environment it inherits sees none, so a hook's GIT_DIR cannot point its git at this repository", () => {
  const inherited = spawnSync("sh", ["-c", "env"], { encoding: "utf8" })
    .stdout.split("\n")
    .filter((line) => line.startsWith("GIT_"))
    .map((line) => line.slice(0, line.indexOf("=")));

  expect(inherited).toEqual([]);
});
