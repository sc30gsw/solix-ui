import { type Accessor, createMemo, untrack } from "solid-js";
import { access, accessUntracked } from "./internal-access";
import { createValue } from "./internal-value";
import type { MaybeAccessor } from "./types";

/** The options of `createUncontrolled`. */
export type UncontrolledOptions<T, P extends unknown[] = []> = {
  /** Live. While it reads anything but `undefined`, the state is controlled and this is its value. */
  value?: MaybeAccessor<T | undefined>;
  /** Read once. The first uncontrolled value. */
  defaultValue?: MaybeAccessor<T | undefined>;
  /** Read once. The first uncontrolled value when `defaultValue` is `undefined`. */
  finalValue?: MaybeAccessor<T>;
  /** Called after a request that changes the value, with the value and the request's payload. */
  onChange?: (value: T, ...payload: P) => void;
};

/** `[value, setValue, controlled]`. */
export type UncontrolledReturn<T, P extends unknown[] = []> = [
  value: Accessor<T>,
  setValue: (value: T, ...payload: P) => void,
  controlled: Accessor<boolean>,
];

/**
 * The state of a control that a consumer may own: controlled while `value` reads anything but
 * `undefined`, uncontrolled otherwise, and free to switch while it runs. The uncontrolled value
 * survives a controlled stretch and comes back when `value` reads `undefined` again.
 *
 * `setValue` is a request. Requests made before Solid's next flush resolve to the last one, and a
 * request for the value it would replace does nothing: no write and no `onChange`. While
 * uncontrolled, the request writes the value and then calls `onChange`. While controlled, it only
 * calls `onChange`, and the consumer decides. Passing `finalValue` makes the value `T`; without it
 * the value may be `undefined`.
 *
 * ```ts
 * const [value, setValue, controlled] = createUncontrolled({
 *   value: () => props.value,
 *   defaultValue: () => props.defaultValue,
 *   finalValue: "",
 *   onChange: (next) => props.onChange?.(next),
 * });
 * ```
 */
export function createUncontrolled<T, P extends unknown[] = []>(
  options: UncontrolledOptions<T, P> & { finalValue: MaybeAccessor<T> },
): UncontrolledReturn<T, P>;
export function createUncontrolled<T, P extends unknown[] = []>(
  options: UncontrolledOptions<T, P>,
): UncontrolledReturn<T | undefined, P>;
export function createUncontrolled<T, P extends unknown[] = []>(
  options: UncontrolledOptions<T, P>,
): UncontrolledReturn<T, P> {
  const uncontrolled = createValue(
    (accessUntracked(options.defaultValue) ?? accessUntracked(options.finalValue)) as T,
  );
  const requested = createValue<{ value: T } | undefined>(undefined);
  const controlled = createMemo(() => access(options.value) !== undefined);
  const value = createMemo(() => {
    const outside = access(options.value);
    return outside === undefined ? uncontrolled.get() : outside;
  });
  const setValue = (next: T, ...payload: P) => {
    const changed = untrack(controlled)
      ? requested.update((staged, stagedThisTick) => {
          const current = stagedThisTick && staged ? staged.value : untrack(value);
          return Object.is(current, next) ? staged : { value: next };
        })
      : uncontrolled.update(() => next);
    if (changed) options.onChange?.(next, ...payload);
  };
  return [value, setValue, controlled];
}
