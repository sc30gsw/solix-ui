import { type Accessor, createMemo } from "solid-js";
import { accessUntracked } from "./internal-access";
import { sameItems } from "./internal-equal";
import { createValue } from "./internal-value";
import type { ReadOnce } from "./types";

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
 * A value with an undo history. It starts with one entry, `initialValue`. `set` drops the entries
 * after the current one and appends, as an editor's undo does, `back` and `forward` move through the
 * entries and stop at either end, and `reset` returns to the initial value alone. Each request
 * decides on the value staged by the requests before it in the same tick; a request that changes
 * nothing writes nothing and calls nothing. A move past either end changes nothing.
 *
 * ```ts
 * const [text, { set, back, forward }, { history, current }] = createStateHistory("");
 * ```
 */
export function createStateHistory<T>(
  initialValue: ReadOnce<T>,
): [value: Accessor<T>, handlers: StateHistoryHandlers<T>, history: StateHistory<T>] {
  const initial = accessUntracked(initialValue);
  const state = createValue(
    { history: [initial], current: 0 },
    (left, right) => left.current === right.current && sameItems(left.history, right.history),
  );
  const move = (steps: number) => {
    state.update((staged) => ({
      history: staged.history,
      current: Math.min(Math.max(staged.current + steps, 0), staged.history.length - 1),
    }));
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
        state.update(() => ({ history: [initial], current: 0 }));
      },
    },
    {
      history: createMemo(() => state.get().history),
      current: createMemo(() => state.get().current),
    },
  ];
}
