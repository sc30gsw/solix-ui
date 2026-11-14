import { type Accessor, createMemo } from "solid-js";
import { accessUntracked } from "./internal-access";
import { sameItems } from "./internal-equal";
import { createValue } from "./internal-value";
import type { MaybeAccessor } from "./types";

/** The options of `createQueue`. */
export type QueueOptions<T> = {
  /** Read once. The items it starts with, split by `limit`. */
  initialValues?: MaybeAccessor<readonly T[]>;
  /** How many items `state` holds. Read by each command, so a new limit applies from the next one. */
  limit: MaybeAccessor<number>;
};

/** What `createQueue` returns. */
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
 * `update` moves the next queued item up. Requests made before Solid's next flush build on each
 * other, and one that leaves both lists as they were writes nothing.
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
  const lists = createValue(split([...(accessUntracked(options.initialValues) ?? [])]));
  const change = (next: (staged: { state: T[]; queue: T[] }) => { state: T[]; queue: T[] }) => {
    lists.update((staged) => {
      const changed = next(staged);
      const state = sameItems(changed.state, staged.state) ? staged.state : changed.state;
      const queue = sameItems(changed.queue, staged.queue) ? staged.queue : changed.queue;
      return state === staged.state && queue === staged.queue ? staged : { state, queue };
    });
  };
  return {
    state: createMemo(() => lists.get().state),
    queue: createMemo(() => lists.get().queue),
    add: (...items) => change((staged) => split([...staged.state, ...staged.queue, ...items])),
    update: (fn) => change((staged) => split(fn([...staged.state, ...staged.queue]))),
    cleanQueue: () => change((staged) => ({ state: staged.state, queue: [] })),
  };
}
