import type { ExecFileSyncOptionsWithStringEncoding } from "node:child_process";
import {
  askWith,
  installedSeam,
  installedVitePlusVersion as installedVitePlusVersionOf,
} from "#/scripts/package-manager.internal.ts";

export {
  packageManagerConfigQuery,
  PackageManagerMismatch,
  PackageManagerQueryFailed,
  pinnedPnpmOf,
  VitePlusNotFound,
  VitePlusVersionMismatch,
  withoutPackageManagerEnv,
  WorkingDirectoryMissing,
} from "#/scripts/package-manager.internal.ts";

export function installedVitePlusVersion(): string | undefined {
  return installedVitePlusVersionOf(installedSeam());
}

export function askPackageManager(
  args: readonly string[],
  options: ExecFileSyncOptionsWithStringEncoding,
): string {
  return askWith(installedSeam(), args, options);
}
