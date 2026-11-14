import { type Accessor, createMemo } from "solid-js";
import { accessUntracked } from "./internal-access";
import { createValue } from "./internal-value";
import type { MaybeAccessor } from "./types";

/** The commands of `createStateHistory`. */
export type StateHistoryHandlers<T> = {
  /** Drops every entry after the current one, then appends the value and makes it current. */
  readonly set: (value: T) => void;
  /** Moves back, 1 step by default, and stops at the first entry. */
  readonly back: (steps?: number) => void;
  /** Moves forward, 1 step by default, and stops at the last entry. */
  readonly forward: (steps?: number) => void;
  /** Returns to one entry, the initial value. */
  readonly reset: () => void;
};

/** The whole history behind `createStateHistory`. */
export type StateHistory<T> = {
  readonly history: Accessor<T[]>;
  /** The index of the current entry in `history`. */
  readonly current: Accessor<number>;
};

/**
 * A value with an undo history. It starts with one entry, `initialValue`, read once. `set` drops
 * the entries after the current one and appends, as an editor's undo does, `back` and `forward`
 * move through the entries and stop at either end, and `reset` returns to the initial value alone.
 * Requests made before Solid's next flush build on each other, and a move past either end writes
 * nothing.
 *
 * ```ts
 * const [text, { set, back, forward }, { history, current }] = createStateHistory("");
 * ```
 */
export function createStateHistory<T>(
  initialValue: MaybeAccessor<T>,
): [value: Accessor<T>, handlers: StateHistoryHandlers<T>, history: StateHistory<T>] {
  const initial = accessUntracked(initialValue);
  const state = createValue({ history: [initial], current: 0 });
  const move = (steps: number) => {
    state.update((staged) => {
      const current = Math.min(Math.max(staged.current + steps, 0), staged.history.length - 1);
      return current === staged.current ? staged : { history: staged.history, current };
    });
  };
  return [
    createMemo(() => state.get().history[state.get().current]),
    {
      set: (value) => {
        state.update((staged) => ({
          history: [...staged.history.slice(0, staged.current + 1), value],
          current: staged.current + 1,
        }));
      },
      back: (steps = 1) => move(-steps),
      forward: (steps = 1) => move(steps),
      reset: () => {
        state.update((staged) =>
          staged.history.length === 1 && Object.is(staged.history[0], initial)
            ? staged
            : { history: [initial], current: 0 },
        );
      },
    },
    {
      history: createMemo(() => state.get().history),
      current: createMemo(() => state.get().current),
    },
  ];
}
