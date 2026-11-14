import { type Accessor, createMemo } from "solid-js";

/**
 * The value that `value` held before its latest change, `undefined` until it first changes. Pass
 * the accessor itself, `() => props.value`, so the change is tracked. A read of `value` that
 * returns the value it already held is not a change.
 *
 * ```ts
 * const previousPage = createPrevious(() => props.page);
 * ```
 */
export function createPrevious<T>(value: Accessor<T>): Accessor<T | undefined> {
  const latest = createMemo<{ current: T; previous: T | undefined }>((last) => {
    const current = value();
    if (last && Object.is(current, last.current)) return last;
    return { current, previous: last?.current };
  });
  return createMemo(() => latest().previous);
}
