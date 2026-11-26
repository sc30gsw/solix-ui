import type { ExecFileSyncOptionsWithStringEncoding } from "node:child_process";
import { askWith, installedSeam } from "#/scripts/package-manager.internal.ts";

export {
  installedVitePlusVersion,
  PackageManagerMismatch,
  PackageManagerQueryFailed,
  VitePlusNotFound,
  VitePlusVersionMismatch,
  WorkingDirectoryMissing,
} from "#/scripts/package-manager.internal.ts";

export function askPackageManager(
  args: readonly string[],
  options: ExecFileSyncOptionsWithStringEncoding,
): string {
  return askWith(installedSeam(), args, options);
}
