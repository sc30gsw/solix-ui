import type { Accessor } from "solid-js";
import { accessUntracked } from "#/src/internal-access.ts";
import { sameItems } from "#/src/internal-equal.ts";
import { createValue } from "#/src/internal-value.ts";
import type { ReadOnce } from "#/src/types.ts";

/** Two positions in the list, for `reorder` and `swap`. */
export type ListMove = { from: number; to: number };

/** Each command makes a new array and never changes the old one. */
export type ListStateHandlers<T> = {
  readonly setState: (next: T[] | ((current: T[]) => T[])) => void;
  readonly append: (...items: T[]) => void;
  readonly prepend: (...items: T[]) => void;
  /** Inserts the items before `index`, in order. */
  readonly insert: (index: number, ...items: T[]) => void;
  readonly pop: () => void;
  readonly shift: () => void;
  readonly apply: (fn: (item: T, index: number) => T) => void;
  readonly applyWhere: (
    condition: (item: T, index: number) => boolean,
    fn: (item: T, index: number) => T,
  ) => void;
  /** Removes the items at these indices, counted in the list before the removal. */
  readonly remove: (...indices: number[]) => void;
  /** Moves the item at `from` so that it ends at `to`. */
  readonly reorder: (move: ListMove) => void;
  readonly swap: (move: ListMove) => void;
  readonly setItem: (index: number, item: T) => void;
  /** Replaces one property of the object at `index` with a shallow copy. */
  readonly setItemProp: <K extends keyof T>(index: number, prop: K, value: T[K]) => void;
  readonly filter: (fn: (item: T, index: number) => boolean) => void;
};

/**
 * A list with commands that each make a new array. It starts with `initialValue`, which may be an
 * array or a function that returns one, `[]` by default. Indices are not checked: one out of range
 * does what the array method does. Each request decides on the value staged by the requests before
 * it in the same tick; a request that changes nothing writes nothing and calls nothing. A request
 * that leaves every item where it was changes nothing.
 *
 * ```ts
 * const [todos, { append, remove, setItemProp }] = createListState<Todo>([]);
 * ```
 */
export function createListState<T>(
  initialValue: ReadOnce<T[]> = [],
): [list: Accessor<T[]>, handlers: ListStateHandlers<T>] {
  const list = createValue([...accessUntracked(initialValue)], sameItems);
  const edited = (staged: T[], edit: (copy: T[]) => void) => {
    const copy = [...staged];
    edit(copy);
    return copy;
  };
  return [
    list.get,
    {
      setState: (next) =>
        list.update((staged) => (typeof next === "function" ? next(staged) : next)),
      append: (...items) => list.update((staged) => [...staged, ...items]),
      prepend: (...items) => list.update((staged) => [...items, ...staged]),
      insert: (index, ...items) =>
        list.update((staged) => [...staged.slice(0, index), ...items, ...staged.slice(index)]),
      pop: () => list.update((staged) => staged.slice(0, -1)),
      shift: () => list.update((staged) => staged.slice(1)),
      apply: (fn) => list.update((staged) => staged.map(fn)),
      applyWhere: (condition, fn) =>
        list.update((staged) =>
          staged.map((item, index) => (condition(item, index) ? fn(item, index) : item)),
        ),
      remove: (...indices) =>
        list.update((staged) => staged.filter((_item, index) => !indices.includes(index))),
      reorder: (move) =>
        list.update((staged) =>
          edited(staged, (copy) => {
            copy.splice(move.to, 0, ...copy.splice(move.from, 1));
          }),
        ),
      swap: (move) =>
        list.update((staged) =>
          edited(staged, (copy) => {
            copy[move.from] = staged[move.to];
            copy[move.to] = staged[move.from];
          }),
        ),
      setItem: (index, item) =>
        list.update((staged) =>
          edited(staged, (copy) => {
            copy[index] = item;
          }),
        ),
      setItemProp: (index, prop, value) =>
        list.update((staged) =>
          edited(staged, (copy) => {
            copy[index] = { ...(staged[index] as object), [prop]: value } as T;
          }),
        ),
      filter: (fn) => list.update((staged) => staged.filter(fn)),
    },
  ];
}
