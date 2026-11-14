import { type Accessor, createMemo, untrack } from "solid-js";
import { accessUntracked } from "./internal-access";
import { createValue } from "./internal-value";
import type { MaybeAccessor } from "./types";

/** The options of `createUncontrolled`. */
export type UncontrolledOptions<T, P extends unknown[] = []> = {
  /** Live. While it reads anything but `undefined`, the state is controlled and this is its value. */
  value?: Accessor<T | undefined>;
  /** Read once. The first uncontrolled value. */
  defaultValue?: MaybeAccessor<T | undefined>;
  /** Read once. The first uncontrolled value when `defaultValue` is `undefined`. */
  finalValue?: MaybeAccessor<T>;
  /** Called after a request that changes the value, with the value and the request's payload. */
  onChange?: (value: T, ...payload: P) => void;
};

/** `[value, setValue, controlled]`. */
export type UncontrolledReturn<T, P extends unknown[] = [], V extends T | undefined = T> = [
  value: Accessor<V>,
  setValue: (value: T, ...payload: P) => void,
  controlled: Accessor<boolean>,
];

/**
 * The state of a control that a consumer may own: controlled while `value` reads anything but
 * `undefined`, uncontrolled otherwise, and free to switch while it runs. The uncontrolled value
 * survives a controlled stretch and comes back when `value` reads `undefined` again. Pass the
 * accessor itself, `() => props.value`, so the switch is followed.
 *
 * `setValue` is a request. While uncontrolled, it decides on the value staged by the requests
 * before it in the same tick, writes it and then calls `onChange`; one for the value it would
 * replace writes nothing and calls nothing. While controlled, it writes nothing and calls
 * `onChange`, and the consumer decides; it calls nothing only when the request before it in the
 * same tick asked for the same value. `setValue` takes a `T` with or without `finalValue`; passing
 * `finalValue` makes the value a `T` too, and without it the value may be `undefined`.
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
): UncontrolledReturn<T, P, T | undefined>;
export function createUncontrolled<T, P extends unknown[] = []>(
  options: UncontrolledOptions<T, P>,
): UncontrolledReturn<T, P> {
  const uncontrolled = createValue(
    (accessUntracked(options.defaultValue) ?? accessUntracked(options.finalValue)) as T,
  );
  const requested = createValue<{ value: T } | undefined>(undefined);
  const value = createMemo(() => {
    const outside = options.value?.();
    return outside === undefined ? uncontrolled.get() : outside;
  });
  const controlled = createMemo(() => {
    const outside = options.value?.();
    return outside !== undefined;
  });
  const setValue = (next: T, ...payload: P) => {
    const changed = untrack(controlled)
      ? requested.update((staged, stagedThisTick) =>
          stagedThisTick && staged && Object.is(staged.value, next) ? staged : { value: next },
        )
      : uncontrolled.update(() => next);
    if (changed) options.onChange?.(next, ...payload);
  };
  return [value, setValue, controlled];
}
