import type { Accessor } from "solid-js";
import { accessUntracked } from "./internal-access";
import { createValue } from "./internal-value";
import type { MaybeAccessor } from "./types";

/** What `setState` takes: some of the keys, or an updater that returns them. */
export type SetStatePatch<T> = Partial<T> | ((current: T) => Partial<T>);

/**
 * An object that takes partial updates. It starts at `initialState`, read once. `setState` merges
 * the keys it is given, or the keys an updater returns for the current object, into a new object
 * and leaves the old one as it was. Requests made before Solid's next flush build on each other,
 * and one that sets every key to the value it holds writes nothing.
 *
 * ```ts
 * const [filters, setFilters] = createSetState({ query: "", page: 1 });
 * setFilters({ page: 2 });
 * ```
 */
export function createSetState<T extends object>(
  initialState: MaybeAccessor<T>,
): [state: Accessor<T>, setState: (patch: SetStatePatch<T>) => void] {
  const state = createValue(accessUntracked(initialState));
  const setState = (patch: SetStatePatch<T>) => {
    state.update((staged) => {
      const keys = typeof patch === "function" ? patch(staged) : patch;
      const unchanged = Reflect.ownKeys(keys).every(
        (key) => key in staged && Object.is(staged[key as keyof T], keys[key as keyof typeof keys]),
      );
      return unchanged ? staged : { ...staged, ...keys };
    });
  };
  return [state.get, setState];
}
