import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vite-plus/test";
import {
  askWith,
  candidatesOf,
  installedSeam,
  PackageManagerMismatch,
  PackageManagerQueryFailed,
  type Seam,
  VitePlusNotFound,
  VitePlusVersionMismatch,
  WorkingDirectoryMissing,
} from "#/scripts/package-manager.internal.ts";
import { installedVitePlusVersion } from "#/scripts/package-manager.ts";
import { repositoryRoot } from "#/scripts/repository.ts";
import {
  callsOf,
  configQuery,
  writeStandInVitePlus,
  writeVpScript,
  writeVpShim,
} from "#/tests/support/shims.ts";

const release = "1.8.0";
const query = ["why", "solid-js", "--json"];
const temporary: string[] = [];

afterEach(() => {
  for (const directory of temporary.splice(0)) rmSync(directory, { recursive: true });
});

function temporaryDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), "package-manager-"));
  temporary.push(directory);
  return directory;
}

function seamIn(directory: string, onPath: string, installed = true): Seam {
  const vitePlus = join(directory, "node_modules/vite-plus");
  if (installed) {
    writeStandInVitePlus(vitePlus, release);
    writeVpScript(join(vitePlus, "bin/vp.mjs"), { version: release, answer: "from the bin" });
  }
  return { onPath, root: directory, vitePlus, packageManager: "pnpm@12.23.0" };
}

function scriptOf(seam: Seam): string {
  return join(seam.vitePlus, "bin/vp.mjs");
}

function ask(seam: Seam, args: readonly string[] = query, timeout?: number): string {
  return askWith(seam, args, {
    cwd: seam.root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout,
  });
}

function thrownBy(run: () => unknown): unknown {
  try {
    run();
  } catch (error) {
    return error;
  }
  throw new Error("it did not throw");
}

test("the vp on PATH answers when it is there, after its release and the pnpm it runs are checked, and the vite-plus bin never runs", () => {
  const directory = temporaryDirectory();
  const vp = writeVpShim(directory, "vp", { version: release, answer: "from PATH" });
  const seam = seamIn(directory, vp);

  expect(ask(seam)).toBe("from PATH");
  expect(callsOf(vp)).toEqual(["--version", configQuery, query.join(" ")]);
  expect(callsOf(scriptOf(seam))).toEqual([]);
});

test("when the vp on PATH is missing, the bin.vp of the installed vite-plus answers, run with the Node of this process", () => {
  const directory = temporaryDirectory();
  const seam = seamIn(directory, join(directory, "missing-vp"));

  expect(ask(seam)).toBe("from the bin");
  expect(callsOf(scriptOf(seam))).toEqual(["--version", configQuery, query.join(" ")]);
});

test("with no vp on PATH and no vite-plus installed, it fails with VitePlusNotFound, which says why each candidate cannot answer", () => {
  const directory = temporaryDirectory();
  const missing = join(directory, "missing-vp");
  const error = thrownBy(() => ask(seamIn(directory, missing, false)));

  expect(error).toBeInstanceOf(VitePlusNotFound);
  expect((error as VitePlusNotFound).reasons).toEqual([
    `${missing} does not exist`,
    `vite-plus is not installed in ${directory}`,
  ]);
  expect((error as Error).message).toBe(
    `No vp can answer vp ${query.join(" ")}: ${missing} does not exist; vite-plus is not installed in ${directory}. Install the global vp, then run \`vp install\`.`,
  );
});

test("an installed vite-plus whose bin.vp is missing or unnamed is not a candidate, and says so", () => {
  const directory = temporaryDirectory();
  const missing = join(directory, "missing-vp");
  const seam = seamIn(directory, missing, false);
  writeStandInVitePlus(seam.vitePlus, release);

  expect((thrownBy(() => ask(seam)) as VitePlusNotFound).reasons).toEqual([
    `${missing} does not exist`,
    `${scriptOf(seam)}, the bin.vp of vite-plus, does not exist`,
  ]);
  writeStandInVitePlus(seam.vitePlus, release, {});
  expect((thrownBy(() => ask(seam)) as VitePlusNotFound).reasons).toEqual([
    `${missing} does not exist`,
    `the vite-plus in ${seam.vitePlus} names no bin.vp`,
  ]);
});

test("a vp whose --version exits non-zero fails with the command it ran, and the next candidate never runs", () => {
  const directory = temporaryDirectory();
  const vp = writeVpShim(directory, "vp", { version: release, versionStatus: 4 });
  const seam = seamIn(directory, vp);
  const error = thrownBy(() => ask(seam));

  expect(error).toBeInstanceOf(PackageManagerQueryFailed);
  expect(error).toMatchObject({
    command: `${vp} --version`,
    status: 4,
    message: `${vp} --version exited with 4: version failed on purpose.`,
  });
  expect(callsOf(scriptOf(seam))).toEqual([]);
});

test("a vp whose --version gives no answer in time fails with the timeout that applied, and the next candidate never runs", () => {
  const directory = temporaryDirectory();
  const vp = writeVpShim(directory, "vp", { version: release, versionSeconds: 5 });
  const seam = seamIn(directory, vp);

  expect(() => ask(seam, query, 300)).toThrow(`${vp} --version gave no answer in 0.3 seconds.`);
  expect(callsOf(scriptOf(seam))).toEqual([]);
});

test("a vp whose --version names no release fails with VitePlusVersionMismatch, and is never asked", () => {
  const directory = temporaryDirectory();
  const vp = writeVpShim(directory, "vp", { version: release, versionLine: "something else" });
  const seam = seamIn(directory, vp);
  const error = thrownBy(() => ask(seam));

  expect(error).toBeInstanceOf(VitePlusVersionMismatch);
  expect((error as Error).message).toBe(
    `${vp} --version named no vp release in "something else", but the repository installs vite-plus ${release}. Install the global vp at ${release}, or run \`vp install\` if the catalog moved.`,
  );
  expect(callsOf(vp)).toEqual(["--version"]);
  expect(callsOf(scriptOf(seam))).toEqual([]);
});

test("a vp of another release than the one installed fails with VitePlusVersionMismatch, which names what it compared, and is never asked", () => {
  const directory = temporaryDirectory();
  const vp = writeVpShim(directory, "vp", { version: "0.0.1", answer: "from PATH" });
  const seam = seamIn(directory, vp);
  const error = thrownBy(() => ask(seam));

  expect(error).toBeInstanceOf(VitePlusVersionMismatch);
  expect(error).toMatchObject({ command: `${vp} --version`, found: "0.0.1", installed: release });
  expect((error as Error).message).toBe(
    `${vp} --version answered vp 0.0.1, but the repository installs vite-plus ${release}. Install the global vp at ${release}, or run \`vp install\` if the catalog moved.`,
  );
  expect(callsOf(vp)).toEqual(["--version"]);
});

test("a vp that answers where no vite-plus is installed fails with VitePlusVersionMismatch, which says to run vp install", () => {
  const directory = temporaryDirectory();
  const vp = writeVpShim(directory, "vp", { version: release });
  const error = thrownBy(() => ask(seamIn(directory, vp, false)));

  expect(error).toBeInstanceOf(VitePlusVersionMismatch);
  expect((error as Error).message).toBe(
    `${vp} --version answered vp ${release}, but vite-plus is not installed in the repository. Run \`vp install\`.`,
  );
});

test("a vp whose pnpm is not the one packageManager names fails with PackageManagerMismatch, and is never asked", () => {
  const directory = temporaryDirectory();
  const vp = writeVpShim(directory, "vp", { version: release, pnpm: "10.28.0" });
  const seam = seamIn(directory, vp);
  const error = thrownBy(() => ask(seam));

  expect(error).toBeInstanceOf(PackageManagerMismatch);
  expect(error).toMatchObject({
    command: `${vp} ${configQuery} in ${directory}`,
    found: "10.28.0",
    pinned: "12.23.0",
  });
  expect(callsOf(vp)).toEqual(["--version", configQuery]);
  expect(callsOf(scriptOf(seam))).toEqual([]);
});

test("the pnpm is read from userAgent, as pnpm 12 reports it, or from user-agent, as pnpm 10 does, and an answer without one fails", () => {
  const directory = temporaryDirectory();
  const ten = writeVpShim(directory, "vp-ten", {
    version: release,
    config: JSON.stringify({ "user-agent": "pnpm/12.23.0 npm/? node/v26.13.1 linux x64" }),
    answer: "from pnpm 10",
  });
  const none = writeVpShim(directory, "vp-none", { version: release, config: "{}" });

  expect(ask(seamIn(directory, ten))).toBe("from pnpm 10");
  expect(thrownBy(() => ask(seamIn(directory, none)))).toMatchObject({ found: undefined });
});

test("a query that exits non-zero fails with the command it ran, and the next candidate never runs", () => {
  const directory = temporaryDirectory();
  const vp = writeVpShim(directory, "vp", { version: release, status: 3 });
  const seam = seamIn(directory, vp);
  const error = thrownBy(() => ask(seam));

  expect(error).toBeInstanceOf(PackageManagerQueryFailed);
  expect(error).toMatchObject({
    command: `${vp} ${query.join(" ")}`,
    status: 3,
    message: `${vp} ${query.join(" ")} exited with 3: failed on purpose.`,
  });
  expect(callsOf(scriptOf(seam))).toEqual([]);
});

test("a working directory that does not exist fails with WorkingDirectoryMissing before any vp runs", () => {
  const directory = temporaryDirectory();
  const vp = writeVpShim(directory, "vp", { version: release });
  const gone = join(directory, "gone");
  const error = thrownBy(() =>
    askWith(seamIn(directory, vp), query, { cwd: gone, encoding: "utf8" }),
  );

  expect(error).toBeInstanceOf(WorkingDirectoryMissing);
  expect((error as Error).message).toBe(
    `vp ${query.join(" ")} cannot run in ${gone}, which is not a directory.`,
  );
  expect(callsOf(vp)).toEqual([]);
});

test("the settings query is asked once, and every answer checks the release and the pnpm again", () => {
  const directory = temporaryDirectory();
  const vp = writeVpShim(directory, "vp", { version: release });
  const seam = seamIn(directory, vp);

  ask(seam, configQuery.split(" "));
  ask(seam, configQuery.split(" "));

  expect(callsOf(vp)).toEqual(["--version", configQuery, "--version", configQuery]);
});

test("the repository asks vp on PATH, then the bin.vp of the vite-plus it installs, which exists, run with the Node of this process, and that vite-plus is a release", () => {
  const seam = installedSeam();
  const script = join(repositoryRoot, "node_modules/vite-plus/bin/vp");

  expect(seam).toMatchObject({ onPath: "vp", root: repositoryRoot });
  expect(candidatesOf(seam)).toEqual([
    { command: "vp", prefix: [] },
    { command: process.execPath, prefix: [script] },
  ]);
  expect(existsSync(script)).toBe(true);
  expect(installedVitePlusVersion()).toMatch(/^\d+\.\d+\.\d+/);
});
