import { createBrowserCommand, createStateCommand } from "./internal-command";

export function createCommanded(): [() => void, () => void] {
  const state = { count: 0 };
  return [
    createStateCommand(
      () => {
        state.count += 1;
      },
      () => undefined,
    ),
    createBrowserCommand(
      () => window.scrollTo(0, state.count),
      () => undefined,
    ),
  ];
}
