import { createStateCommand } from "../../../../../packages/primitives/src/internal-command";
import { verticalOffset } from "./internal-position";

function home(): void {
  window.scrollTo(0, 0);
}

export function createCommanded(): [() => void, () => void, () => number] {
  return [
    createStateCommand(() => window.scrollTo(0, 0), () => undefined),
    createStateCommand(() => home(), () => undefined),
    createStateCommand(() => verticalOffset(), () => 0),
  ];
}
