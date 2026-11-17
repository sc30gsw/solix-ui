import { createBrowserCommand, createStateCommand } from "#/packages/primitives/src/internal-command.ts";

function scrollHome(count: number): void {
  window.scrollTo(0, count);
}

/** Holds what the rules allow. */
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
      () => scrollHome(state.count),
      () => undefined,
    ),
  ];
}
