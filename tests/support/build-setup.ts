import { buildEveryPackage } from "#/tests/support/global-setup.ts";

export function setup(): void {
  buildEveryPackage("tests/support/build-setup.ts");
}
