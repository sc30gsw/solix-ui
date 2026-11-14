import { type Accessor, createMemo, untrack } from "solid-js";
import { accessUntracked } from "./internal-access";
import { createRequest } from "./internal-request";
import { createValue } from "./internal-value";
import type { ReadOnce } from "./types";

export type UncontrolledOptions<T, P extends unknown[] = []> = {
  /** While it reads anything but `undefined`, the state is controlled and this is its value. */
  value?: Accessor<T | undefined>;
  /** The first uncontrolled value. */
  defaultValue?: ReadOnce<T | undefined>;
  /** The first uncontrolled value when `defaultValue` is `undefined`. */
  finalValue?: ReadOnce<T>;
  /** Called after a request that changes the value, with the value and the request's payload. */
  onChange?: (value: T, ...payload: P) => void;
};

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
 * `setValue` is a request: each request decides on the value staged by the requests before it in
 * the same tick; a request that changes nothing writes nothing and calls nothing. While
 * uncontrolled, the staged value is the uncontrolled value, which the request writes before it
 * calls `onChange`. While controlled, the staged value is the request made before it in the same
 * tick, if any, and the request writes nothing and calls `onChange`, so the consumer decides. A
 * controlled request with none before it always calls `onChange`. `setValue` takes a `T` with or
 * without `finalValue`; passing `finalValue` makes the value a `T` too, and without it the value
 * may be `undefined`.
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
  options: UncontrolledOptions<T, P> & { finalValue: ReadOnce<T> },
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
  const request = createRequest<T>();
  const value = createMemo(() => {
    const outside = options.value?.();
    return outside === undefined ? uncontrolled.get() : outside;
  });
  const controlled = createMemo(() => {
    const outside = options.value?.();
    return outside !== undefined;
  });
  const setValue = (next: T, ...payload: P) => {
    const changed = untrack(controlled) ? request(next) : uncontrolled.update(() => next).changed;
    if (changed) options.onChange?.(next, ...payload);
  };
  return [value, setValue, controlled];
}
