import type { Accessor } from "solid-js";
import { accessUntracked } from "#/src/internal-access.ts";
import { createValue } from "#/src/internal-value.ts";
import type { MaybeAccessor, ReadOnce } from "#/src/types.ts";

/** Each option is read when a handler runs. */
export type CounterOptions = {
  /** The lowest count. Default `-Infinity`. */
  min?: MaybeAccessor<number>;
  /** The highest count. Default `Infinity`. */
  max?: MaybeAccessor<number>;
  /** How far `increment` and `decrement` move, taken as its absolute value. Default `1`. */
  step?: MaybeAccessor<number>;
};

export type CounterHandlers = {
  readonly increment: () => void;
  readonly decrement: () => void;
  readonly set: (value: number) => void;
  readonly reset: () => void;
};

/**
 * A number kept between `min` and `max`. It starts at `initialValue`, clamped.
 * `increment` and `decrement` move it by the absolute value of `step`, `set` writes a value, and
 * `reset` returns to `initialValue`, each clamped to the bounds as they are when the handler runs. A
 * count that is already out of new bounds stays until the next handler. Each request decides on
 * the value staged by the requests before it in the same tick; a request that changes nothing
 * writes nothing and calls nothing.
 *
 * ```ts
 * const [count, { increment, decrement, set, reset }] = createCounter(0, { min: 0, max: () => props.max });
 * ```
 */
export function createCounter(
  initialValue: ReadOnce<number> = 0,
  options?: CounterOptions,
): [count: Accessor<number>, handlers: CounterHandlers] {
  const clamped = (value: number) =>
    Math.min(
      Math.max(value, accessUntracked(options?.min ?? -Infinity)),
      accessUntracked(options?.max ?? Infinity),
    );
  const step = () => Math.abs(accessUntracked(options?.step ?? 1));
  const initial = accessUntracked(initialValue);
  const count = createValue(clamped(initial));
  return [
    count.get,
    {
      increment: () => {
        count.update((staged) => clamped(staged + step()));
      },
      decrement: () => {
        count.update((staged) => clamped(staged - step()));
      },
      set: (value) => {
        count.update(() => clamped(value));
      },
      reset: () => {
        count.update(() => clamped(initial));
      },
    },
  ];
}
