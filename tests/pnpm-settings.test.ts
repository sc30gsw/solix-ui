import {
  globSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test, vi } from "vite-plus/test";
import {
  pnpmSettings,
  readPnpmSettings,
  rewriteCatalog,
  settingsFrom,
  workspaceFile,
} from "#/scripts/pnpm-settings.ts";
import { repositoryRoot } from "#/scripts/repository.ts";
import { packages } from "#/tests/support/workspace.ts";

const catalogOnly = ["catalog:", '  "@solidjs/web": 2.0.0-rc.21', "  solid-js: 2.0.0-rc.21", ""];
const agePolicy = ["minimumReleaseAge: 99", "minimumReleaseAgeStrict: true", ""];
const temporary: string[] = [];
const namesAReleaseAgeSetting = /minimum[-_.]?release[-_.]?age|trust[-_.]?lockfile|pnpmfile/i;
const githubFiles = globSync(".github/**/*.{yml,yaml}", { cwd: repositoryRoot });
const hookFiles = globSync(".vite-hooks/*", { cwd: repositoryRoot }).filter((path) =>
  statSync(join(repositoryRoot, path)).isFile(),
);

afterEach(() => {
  vi.unstubAllEnvs();
  for (const directory of temporary.splice(0)) rmSync(directory, { recursive: true });
});

function temporaryDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), "pnpm-settings-"));
  temporary.push(directory);
  return directory;
}

function checkoutWith(lines: readonly string[]): string {
  const checkout = temporaryDirectory();
  writeFileSync(join(checkout, workspaceFile), lines.join("\n"));
  return checkout;
}

function userConfigWith(lines: readonly string[]): string {
  const configHome = temporaryDirectory();
  mkdirSync(join(configHome, "pnpm"));
  writeFileSync(join(configHome, "pnpm/config.yaml"), lines.join("\n"));
  return configHome;
}

test(`${workspaceFile} sets minimumReleaseAge and minimumReleaseAgeStrict: true, exempts no release from them, ignores every pnpmfile, loads no config dependency, and does not trust the lockfile past the release-age check`, () => {
  expect(pnpmSettings().minimumReleaseAge).toBeGreaterThan(0);
  expect(pnpmSettings().minimumReleaseAgeStrict).toBe(true);
  expect(
    pnpmSettings().minimumReleaseAgeExclude,
    `${workspaceFile}: remove every minimumReleaseAgeExclude entry; a release younger than minimumReleaseAge is not installed.`,
  ).toEqual([]);
  expect(pnpmSettings().trustLockfile).toBe(false);
  expect(pnpmSettings().ignorePnpmfile).toBe(true);
  expect(pnpmSettings().configDependencies).toEqual({});
});

function logicalLines(text: string): { number: number; line: string }[] {
  const lines = text.split("\n");
  return lines.flatMap((line, index) => {
    if (index > 0 && lines[index - 1]?.endsWith("\\")) return [];
    let joined = line;
    for (let next = index; joined.endsWith("\\") && next + 1 < lines.length; next += 1) {
      joined = joined.slice(0, -1) + (lines[next + 1] ?? "").trimStart();
    }
    return [{ number: index + 1, line: joined }];
  });
}

test(`no YAML file under .github, no file in .vite-hooks and no script of a workspace manifest names a release-age setting, trustLockfile or a pnpmfile, with lines a backslash continues joined first, so only ${workspaceFile} sets the release age, nothing trusts the lockfile and no pnpmfile runs`, () => {
  const fileLines = [...githubFiles, ...hookFiles].flatMap((file) =>
    logicalLines(readFileSync(join(repositoryRoot, file), "utf8")).map(({ number, line }) => ({
      where: `${file}:${number}`,
      line,
    })),
  );
  const scripts = packages.flatMap(({ path, manifest }) =>
    Object.entries(manifest.scripts ?? {}).map(([name, line]) => ({
      where: `${path} scripts.${name}`,
      line,
    })),
  );
  const settingLines = [...fileLines, ...scripts]
    .filter(({ line }) => namesAReleaseAgeSetting.test(line))
    .map(
      ({ where, line }) =>
        `${where}: names a release-age setting, trustLockfile or a pnpmfile; set the release age only in ${workspaceFile}, do not trust the lockfile, and run no pnpmfile: ${line.trim()}`,
    );

  expect(githubFiles).toContain(".github/workflows/ci.yml");
  expect(hookFiles).toContain(".vite-hooks/pre-commit");
  expect(scripts.length).toBeGreaterThan(1);
  expect(settingLines).toEqual([]);
});

test("the settings are the workspace file's own: the user's pnpm config and pnpm_config_* variables do not reach them", () => {
  const checkout = checkoutWith(catalogOnly);
  vi.stubEnv("XDG_CONFIG_HOME", userConfigWith(agePolicy));
  vi.stubEnv("pnpm_config_minimum_release_age_exclude", "solid-js");
  vi.stubEnv("pnpm_config_trust_lockfile", "true");

  expect(readPnpmSettings(checkout)).toEqual({
    catalog: { "@solidjs/web": "2.0.0-rc.21", "solid-js": "2.0.0-rc.21" },
    overrides: {},
    minimumReleaseAge: undefined,
    minimumReleaseAgeStrict: false,
    minimumReleaseAgeExclude: [],
    trustLockfile: false,
    ignorePnpmfile: false,
    configDependencies: {},
    approvedSkills: {},
  });
  vi.stubEnv("XDG_CONFIG_HOME", userConfigWith([]));
  vi.stubEnv("PNPM_CONFIG_MINIMUM_RELEASE_AGE", "7");
  expect(readPnpmSettings(checkout).minimumReleaseAge).toBeUndefined();
});

test("a workspace-dir variable does not point the reader at another checkout", () => {
  const checkout = checkoutWith(catalogOnly);
  const another = checkoutWith(["catalog:", "  semver: 7.8.6", ...agePolicy]);

  for (const name of ["NPM_CONFIG_WORKSPACE_DIR", "pnpm_config_workspace_dir"]) {
    vi.stubEnv(name, another);
    expect(readPnpmSettings(checkout).catalog).toHaveProperty("solid-js");
    vi.unstubAllEnvs();
  }
});

test("a vp that is neither installed nor on PATH fails with the way to install it", () => {
  expect(() => readPnpmSettings(checkoutWith(catalogOnly), "a-vp-that-is-not-installed")).toThrow(
    /Install Vite\+, then run `vp install`/,
  );
});

test("settingsFrom refuses pnpm settings with no catalog entry, and skills: true in place of names", () => {
  expect(() => settingsFrom({})).toThrow(/no catalog entries/);
  expect(() => settingsFrom({ catalog: {} })).toThrow(/no catalog entries/);
  expect(() =>
    settingsFrom({ catalog: { semver: "7.8.6" }, permissions: { a: { skills: true } } }),
  ).toThrow(/instead of skills: true/);
});

test("rewriteCatalog changes the versions it is given and no other byte of the file", () => {
  const lines = [...catalogOnly.slice(0, -1), "  solid2-agent-kit: 0.25.0", "overrides:", ""];
  const checkout = checkoutWith(lines);

  rewriteCatalog({ "solid-js": "2.0.0-rc.22", "@solidjs/web": "2.0.0-rc.22" }, checkout);

  expect(readFileSync(join(checkout, workspaceFile), "utf8")).toBe(
    lines.join("\n").replaceAll("2.0.0-rc.21", "2.0.0-rc.22"),
  );
});

test("rewriteCatalog leaves the file as it was when it cannot find an entry's line, and undoes an edit that pnpm does not report as that change", () => {
  const quoted = ["catalog:", '  solid-js: "2.0.0-rc.21"', ""];
  const sameLineElsewhere = [
    "catalog:",
    "  solid-js: 2.0.0-rc.21 # the line editor does not know this form",
    "overrides:",
    "  solid-js: 2.0.0-rc.21",
    "",
  ];

  for (const [lines, failure] of [
    [quoted, /does not hold it as one line/],
    [sameLineElsewhere, /does not report exactly solid-js changed; it was undone/],
  ] as const) {
    const checkout = checkoutWith(lines);

    expect(() => rewriteCatalog({ "solid-js": "2.0.0-rc.22" }, checkout)).toThrow(failure);
    expect(readFileSync(join(checkout, workspaceFile), "utf8")).toBe(lines.join("\n"));
  }
});

test("vp run verify first checks the lockfile against the release age, without installing, so a younger release an install let in fails before a commit and in CI", () => {
  const { scripts } = JSON.parse(readFileSync(join(repositoryRoot, "package.json"), "utf8")) as {
    scripts: Record<string, string>;
  };

  expect(scripts["check:lockfile"]).toBe("pnpm install --frozen-lockfile --lockfile-only");
  expect(scripts.verify?.split(" && ")[0]).toBe("vp run check:lockfile");
});
