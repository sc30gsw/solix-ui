import { type Accessor, createMemo, createSignal, onCleanup, untrack } from "solid-js";

export type Equals<T> = (left: T, right: T) => boolean;

export type Update<T> = { changed: boolean; value: T };

export type Value<T> = {
  get: Accessor<T>;
  update: (decide: (staged: T) => T) => Update<T>;
};

export function createValue<T>(initial: T, equals: Equals<T> = Object.is): Value<T> {
  const [box, setBox] = createSignal({ value: initial });
  let live = true;
  onCleanup(() => {
    live = false;
  });
  return {
    get: createMemo(() => box().value, { equals }),
    update: (decide) => {
      const update: Update<T> = { changed: false, value: untrack(box).value };
      if (!live) return update;
      setBox((staged) => {
        const next = decide(staged.value);
        update.changed = !equals(staged.value, next);
        update.value = update.changed ? next : staged.value;
        return update.changed ? { value: next } : staged;
      });
      return update;
    },
  };
}
