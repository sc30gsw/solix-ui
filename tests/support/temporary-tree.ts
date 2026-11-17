import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

export type Tree = Record<string, string>;

export async function inTemporaryTree<T>(
  tree: Tree,
  use: (root: string) => T | Promise<T>,
): Promise<T> {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "temporary-tree-")));
  try {
    for (const [path, text] of Object.entries(tree)) {
      mkdirSync(dirname(join(root, path)), { recursive: true });
      writeFileSync(join(root, path), text);
    }
    return await use(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}
