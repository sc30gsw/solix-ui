import { createScrollFold } from "./internal-scroll";

export function createFolded(): () => number {
  return createScrollFold(() => 0);
}
