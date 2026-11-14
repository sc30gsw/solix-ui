import { type Accessor, createMemo } from "solid-js";
import { accessUntracked } from "./internal-access";
import { sameItems } from "./internal-equal";
import { createValue } from "./internal-value";
import type { MaybeAccessor, ReadOnce } from "./types";

export type QueueOptions<T> = {
  /** The items it starts with, split by `limit`. */
  initialValues?: ReadOnce<readonly T[]>;
  /** How many items `state` holds. Read by each command, so a new limit applies from the next one. */
  limit: MaybeAccessor<number>;
};

export type QueueReturn<T> = {
  /** The first `limit` items. */
  readonly state: Accessor<T[]>;
  /** The items after them, in order. */
  readonly queue: Accessor<T[]>;
  /** Appends the items after every item, then splits again. */
  readonly add: (...items: T[]) => void;
  /** Replaces every item, `state` then `queue`, with what `fn` returns for them, then splits again. */
  readonly update: (fn: (items: T[]) => T[]) => void;
  /** Empties `queue` and leaves `state` as it is. */
  readonly cleanQueue: () => void;
};

/**
 * A list split in two: the first `limit` items in `state`, the rest waiting in `queue`, as a stack
 * of notifications shows a few and holds the others. Removing an item from `state` through
 * `update` moves the next queued item up. Each request decides on the value staged by the requests
 * before it in the same tick; a request that changes nothing writes nothing and calls nothing. One
 * that leaves both lists as they were changes nothing.
 *
 * ```ts
 * const { state, queue, add, update } = createQueue<Notice>({ limit: 3 });
 * ```
 */
export function createQueue<T>(options: QueueOptions<T>): QueueReturn<T> {
  const split = (items: T[]) => {
    const limit = accessUntracked(options.limit);
    return { state: items.slice(0, limit), queue: items.slice(limit) };
  };
  const lists = createValue(
    split([...(accessUntracked(options.initialValues) ?? [])]),
    (left, right) => sameItems(left.state, right.state) && sameItems(left.queue, right.queue),
  );
  return {
    state: createMemo(() => lists.get().state, { equals: sameItems }),
    queue: createMemo(() => lists.get().queue, { equals: sameItems }),
    add: (...items) =>
      lists.update((staged) => split([...staged.state, ...staged.queue, ...items])),
    update: (fn) => lists.update((staged) => split(fn([...staged.state, ...staged.queue]))),
    cleanQueue: () => lists.update((staged) => ({ state: staged.state, queue: [] })),
  };
}
