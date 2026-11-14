import { readdirSync } from "node:fs";
import { basename, join } from "node:path";

const dist = join(import.meta.dirname, "../dist");
const builtComponentFile = /^[A-Z][A-Za-z0-9]*\.jsx$/;

/** The names of the components the library build wrote to `dist` as `<Name>.jsx`. */
export const builtComponents: string[] = readdirSync(dist)
  .filter((file) => builtComponentFile.test(file))
  .map((file) => basename(file, ".jsx"))
  .sort();

if (builtComponents.length === 0) {
  throw new Error(`${dist}: build the library first; it holds no <Name>.jsx component.`);
}
