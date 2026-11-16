import { createStateCommand } from "../../../../../packages/primitives/src/internal-command";
import { verticalOffset } from "./internal-position";

function home(): void {
  window.scrollTo(0, 0);
}

class Page {
  static top(): number {
    return window.scrollY;
  }

  get left(): number {
    return window.scrollX;
  }
}

export function createCommanded(): [() => void, () => void, () => number, () => number, () => number] {
  return [
    createStateCommand(() => window.scrollTo(0, 0), () => undefined),
    createStateCommand(() => home(), () => undefined),
    createStateCommand(() => verticalOffset(), () => 0),
    createStateCommand(() => Page.top(), () => 0),
    createStateCommand(() => new Page().left, () => 0),
  ];
}
