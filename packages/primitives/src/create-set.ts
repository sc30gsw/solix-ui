import type { Accessor } from "solid-js";
import { accessUntracked } from "#/src/internal-access.ts";
import { createValue } from "#/src/internal-value.ts";
import type { ReadOnce } from "#/src/types.ts";

/**
 * A `Set` whose `add`, `delete` and `clear` update it. Read it through the accessor,
 * `set().has(value)`, which tracks the whole set. It starts with `initialValues`.
 *
 * Each change makes a new `Set`, so the accessor returns a new instance after every change. A
 * mutator called on an older instance writes to the latest one. Each request decides on the value
 * staged by the requests before it in the same tick; a request that changes nothing writes nothing
 * and calls nothing. Adding a member it holds, and deleting or clearing nothing, change nothing.
 * `union`, `intersection`, `difference` and `symmetricDifference` are the platform's own: each
 * takes a `Set` or anything with `size`, `has` and `keys`, and returns a new plain `Set` without
 * changing this one.
 *
 * ```ts
 * const selected = createSet<string>();
 * selected().add(id);
 * ```
 */
export function createSet<T>(initialValues?: ReadOnce<Iterable<T>>): Accessor<Set<T>> {
  const request = (changes: (staged: Set<T>) => boolean, change: (copy: Set<T>) => void) =>
    set.update((staged) => {
      if (!changes(staged)) return staged;
      const copy = new Set(staged);
      change(copy);
      return withMutatorsThatUpdate(copy);
    }).changed;
  const withMutatorsThatUpdate = (instance: Set<T>): Set<T> =>
    Object.assign(instance, {
      add: (value: T) => {
        request(
          (staged) => !staged.has(value),
          (copy) => copy.add(value),
        );
        return instance;
      },
      delete: (value: T) =>
        request(
          (staged) => staged.has(value),
          (copy) => copy.delete(value),
        ),
      clear: () => {
        request(
          (staged) => staged.size > 0,
          (copy) => copy.clear(),
        );
      },
    });
  const set = createValue(withMutatorsThatUpdate(new Set(accessUntracked(initialValues) ?? [])));
  return set.get;
}
