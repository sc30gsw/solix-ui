import { type Accessor, createMemo } from "solid-js";
import { accessUntracked } from "./internal-access";
import { sameKeys } from "./internal-equal";
import { createValue } from "./internal-value";
import type { ReadOnce } from "./types";

export type ValidatedState<T> = {
  /** The last value set, valid or not. */
  readonly value: Accessor<T>;
  /** The last value that passed `validate`, or `undefined` while none has. */
  readonly lastValidValue: Accessor<T | undefined>;
  /** Whether `value` passed `validate`. */
  readonly valid: Accessor<boolean>;
};

/**
 * A value that remembers the last one that passed `validate`. It starts at `initialValue`, which is
 * also the last valid value when it passes. `initialValidationState` replaces the first verdict
 * when it is a boolean; every value set after that is judged by `validate`, called when the value
 * is set. Each request decides on the value staged by the requests before it in the same tick; a
 * request that changes nothing writes nothing and calls nothing.
 *
 * ```ts
 * const [{ value, lastValidValue, valid }, setValue] = createValidatedState("", (text) => text.length > 2);
 * ```
 */
export function createValidatedState<T>(
  initialValue: ReadOnce<T>,
  validate: (value: NoInfer<T>) => boolean,
  initialValidationState?: ReadOnce<boolean | undefined>,
): [state: ValidatedState<T>, setValue: (value: T) => void] {
  const initial = accessUntracked(initialValue);
  const initiallyValid = validate(initial);
  const state = createValue(
    {
      value: initial,
      lastValidValue: initiallyValid ? initial : undefined,
      valid: accessUntracked(initialValidationState) ?? initiallyValid,
    },
    sameKeys,
  );
  const setValue = (value: T) => {
    const valid = validate(value);
    state.update((staged) => ({
      value,
      lastValidValue: valid ? value : staged.lastValidValue,
      valid,
    }));
  };
  return [
    {
      value: createMemo(() => state.get().value),
      lastValidValue: createMemo(() => state.get().lastValidValue),
      valid: createMemo(() => state.get().valid),
    },
    setValue,
  ];
}
