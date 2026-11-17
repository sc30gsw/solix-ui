import type { Accessor } from "solid-js";
import { accessUntracked } from "#/src/internal-access.ts";
import { sameKeys } from "#/src/internal-equal.ts";
import { createValue } from "#/src/internal-value.ts";
import type { ReadOnce } from "#/src/types.ts";

/** What `setState` takes: some of the keys, or an updater that returns them. */
export type SetStatePatch<T> = Partial<T> | ((current: T) => Partial<T>);

/**
 * An object that takes partial updates. It starts at `initialState`. `setState` merges the keys it
 * is given, symbols included, or the keys an updater returns for the current object, into a new
 * object and leaves the old one as it was. Each request decides on the value staged by the requests
 * before it in the same tick; a request that changes nothing writes nothing and calls nothing. One
 * that sets every key to the value it holds changes nothing.
 *
 * ```ts
 * const [filters, setFilters] = createSetState({ query: "", page: 1 });
 * setFilters({ page: 2 });
 * ```
 */
export function createSetState<T extends object>(
  initialState: ReadOnce<T>,
): [state: Accessor<T>, setState: (patch: SetStatePatch<T>) => void] {
  const state = createValue(accessUntracked(initialState), sameKeys);
  const setState = (patch: SetStatePatch<T>) => {
    state.update((staged) => ({
      ...staged,
      ...(typeof patch === "function" ? patch(staged) : patch),
    }));
  };
  return [state.get, setState];
}
