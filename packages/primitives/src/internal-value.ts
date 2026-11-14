import { type Accessor, createMemo, createSignal, onCleanup, untrack } from "solid-js";

export type Value<T> = {
  get: Accessor<T>;
  update: (decide: (staged: T, stagedThisTick: boolean) => T) => boolean;
};

export function createValue<T>(initial: T): Value<T> {
  const [box, setBox] = createSignal({ value: initial });
  let live = true;
  onCleanup(() => {
    live = false;
  });
  return {
    get: createMemo(() => box().value),
    update: (decide) => {
      if (!live) return false;
      let changed = false;
      setBox((staged) => {
        const next = decide(staged.value, staged !== untrack(box));
        changed = !Object.is(next, staged.value);
        return changed ? { value: next } : staged;
      });
      return changed;
    },
  };
}
