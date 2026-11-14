import type { Accessor } from "solid-js";
import { accessUntracked } from "./internal-access";
import { createValue } from "./internal-value";
import type { MaybeAccessor } from "./types";

/**
 * A `Set` whose `add`, `delete` and `clear` update it. Read it through the accessor,
 * `set().has(value)`, which tracks the whole set. It starts with `values`, read once.
 *
 * Each change makes a new `Set`, so the accessor returns a new instance after every change. A
 * mutator called on an older instance writes to the latest one, and several mutations before
 * Solid's next flush all land. Adding a member it holds, and deleting or clearing nothing, change
 * nothing. `union`, `intersection`, `difference` and `symmetricDifference` are the platform's own:
 * each takes a `Set` or anything with `size`, `has` and `keys`, and returns a new plain `Set`
 * without changing this one.
 *
 * ```ts
 * const selected = createSet<string>();
 * selected().add(id);
 * ```
 */
export function createSet<T>(values?: MaybeAccessor<Iterable<T>>): Accessor<Set<T>> {
  const request = (changes: (staged: Set<T>) => boolean, change: (copy: Set<T>) => void) =>
    set.update((staged) => {
      if (!changes(staged)) return staged;
      const copy = new Set(staged);
      change(copy);
      return updating(copy);
    });
  const updating = (instance: Set<T>): Set<T> =>
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
  const set = createValue(updating(new Set(accessUntracked(values) ?? [])));
  return set.get;
}
