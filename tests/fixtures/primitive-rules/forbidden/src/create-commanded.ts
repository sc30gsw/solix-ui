import { createStateCommand } from "./internal-command";

function home(): void {
  window.scrollTo(0, 0);
}

export function createCommanded(): [() => void, () => void] {
  return [
    createStateCommand(() => window.scrollTo(0, 0), () => undefined),
    createStateCommand(() => home(), () => undefined),
  ];
}
