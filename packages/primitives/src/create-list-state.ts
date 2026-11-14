import type { Accessor } from "solid-js";
import { accessUntracked } from "./internal-access";
import { sameItems } from "./internal-equal";
import { createValue } from "./internal-value";
import type { MaybeAccessor } from "./types";

/** Two positions in the list, for `reorder` and `swap`. */
export type ListMove = { from: number; to: number };

/** The commands of `createListState`. Each one makes a new array and never changes the old one. */
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
 * A list with commands that each make a new array. It starts with `initialValue`, read once, which
 * may be an array or a function that returns one, `[]` by default. Indices are not checked: one out
 * of range does what the array method does. Requests made before Solid's next flush build on each
 * other, and a request that leaves every item where it was writes nothing.
 *
 * ```ts
 * const [todos, { append, remove, setItemProp }] = createListState<Todo>([]);
 * ```
 */
export function createListState<T>(
  initialValue: MaybeAccessor<T[]> = [],
): [list: Accessor<T[]>, handlers: ListStateHandlers<T>] {
  const list = createValue([...accessUntracked(initialValue)]);
  const change = (next: (staged: T[]) => T[]) => {
    list.update((staged) => {
      const changed = next(staged);
      return sameItems(changed, staged) ? staged : changed;
    });
  };
  const edited = (staged: T[], edit: (copy: T[]) => void) => {
    const copy = [...staged];
    edit(copy);
    return copy;
  };
  return [
    list.get,
    {
      setState: (next) => change((staged) => (typeof next === "function" ? next(staged) : next)),
      append: (...items) => change((staged) => [...staged, ...items]),
      prepend: (...items) => change((staged) => [...items, ...staged]),
      insert: (index, ...items) =>
        change((staged) => [...staged.slice(0, index), ...items, ...staged.slice(index)]),
      pop: () => change((staged) => staged.slice(0, -1)),
      shift: () => change((staged) => staged.slice(1)),
      apply: (fn) => change((staged) => staged.map(fn)),
      applyWhere: (condition, fn) =>
        change((staged) =>
          staged.map((item, index) => (condition(item, index) ? fn(item, index) : item)),
        ),
      remove: (...indices) =>
        change((staged) => staged.filter((_item, index) => !indices.includes(index))),
      reorder: (move) =>
        change((staged) =>
          edited(staged, (copy) => {
            copy.splice(move.to, 0, ...copy.splice(move.from, 1));
          }),
        ),
      swap: (move) =>
        change((staged) =>
          edited(staged, (copy) => {
            copy[move.from] = staged[move.to];
            copy[move.to] = staged[move.from];
          }),
        ),
      setItem: (index, item) =>
        change((staged) =>
          edited(staged, (copy) => {
            copy[index] = item;
          }),
        ),
      setItemProp: (index, prop, value) =>
        change((staged) =>
          edited(staged, (copy) => {
            copy[index] = { ...(staged[index] as object), [prop]: value } as T;
          }),
        ),
      filter: (fn) => change((staged) => staged.filter(fn)),
    },
  ];
}
