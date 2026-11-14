import type { Accessor } from "solid-js";
import { accessUntracked } from "./internal-access";
import { createValue } from "./internal-value";
import type { MaybeAccessor } from "./types";

/** The callbacks of `createDisclosure`, each read when it runs. */
export type DisclosureOptions = {
  /** Runs after `open` or `toggle` changes the state from closed to open. */
  onOpen?: () => void;
  /** Runs after `close` or `toggle` changes the state from open to closed. */
  onClose?: () => void;
};

/** The commands of `createDisclosure`. */
export type DisclosureHandlers = {
  readonly open: () => void;
  readonly close: () => void;
  readonly toggle: () => void;
  /** Writes the state and runs neither callback. */
  readonly set: (opened: boolean) => void;
};

/**
 * Whether something is open, with commands that open, close and toggle it. It starts at
 * `initialState`, read once, `false` by default.
 *
 * `open`, `close` and `toggle` decide on the state as it stands after the requests already made
 * before Solid's next flush, so `open(); open()` runs `onOpen` once, `toggle(); toggle()` ends
 * where it started, and a request that changes nothing runs no callback. Each callback runs after
 * the write.
 *
 * ```ts
 * const [opened, { open, close, toggle }] = createDisclosure(false, { onOpen: () => track("open") });
 * ```
 */
export function createDisclosure(
  initialState: MaybeAccessor<boolean> = false,
  options?: DisclosureOptions,
): [opened: Accessor<boolean>, handlers: DisclosureHandlers] {
  const opened = createValue(accessUntracked(initialState));
  const request = (decide: (staged: boolean) => boolean) => {
    const decided = { opened: false };
    const changed = opened.update((staged) => {
      decided.opened = decide(staged);
      return decided.opened;
    });
    if (!changed) return;
    if (decided.opened) options?.onOpen?.();
    else options?.onClose?.();
  };
  return [
    opened.get,
    {
      open: () => request(() => true),
      close: () => request(() => false),
      toggle: () => request((staged) => !staged),
      set: (value) => {
        opened.update(() => value);
      },
    },
  ];
}
