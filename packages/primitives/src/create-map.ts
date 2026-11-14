import type { Accessor } from "solid-js";
import { accessUntracked } from "./internal-access";
import { createValue } from "./internal-value";
import type { ReadOnce } from "./types";

/**
 * A `Map` whose `set`, `delete` and `clear` update it. Read it through the accessor,
 * `map().get(key)`, which tracks the whole map. It starts with `initialState`.
 *
 * Each change makes a new `Map`, so the accessor returns a new instance after every change. A
 * mutator called on an older instance writes to the latest one. Each request decides on the value
 * staged by the requests before it in the same tick; a request that changes nothing writes nothing
 * and calls nothing. `set` with the value a key already holds, and `delete` or `clear` of nothing,
 * change nothing. `get`, `has`, `size` and iteration are the platform's own.
 *
 * ```ts
 * const users = createMap<string, User>();
 * users().set(id, user);
 * ```
 */
export function createMap<K, V>(
  initialState?: ReadOnce<Iterable<readonly [K, V]>>,
): Accessor<Map<K, V>> {
  const request = (changes: (staged: Map<K, V>) => boolean, change: (copy: Map<K, V>) => void) =>
    map.update((staged) => {
      if (!changes(staged)) return staged;
      const copy = new Map(staged);
      change(copy);
      return withMutatorsThatUpdate(copy);
    }).changed;
  const withMutatorsThatUpdate = (instance: Map<K, V>): Map<K, V> =>
    Object.assign(instance, {
      set: (key: K, value: V) => {
        request(
          (staged) => !staged.has(key) || !Object.is(staged.get(key), value),
          (copy) => copy.set(key, value),
        );
        return instance;
      },
      delete: (key: K) =>
        request(
          (staged) => staged.has(key),
          (copy) => copy.delete(key),
        ),
      clear: () => {
        request(
          (staged) => staged.size > 0,
          (copy) => copy.clear(),
        );
      },
    });
  const map = createValue(withMutatorsThatUpdate(new Map(accessUntracked(initialState) ?? [])));
  return map.get;
}
