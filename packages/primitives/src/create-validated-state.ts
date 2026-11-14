import { type Accessor, createMemo } from "solid-js";
import { accessUntracked } from "./internal-access";
import { createValue } from "./internal-value";
import type { MaybeAccessor } from "./types";

/** The state of `createValidatedState`. */
export type ValidatedState<T> = {
  /** The last value set, valid or not. */
  readonly value: Accessor<T>;
  /** The last value that passed `validate`, or `undefined` while none has. */
  readonly lastValidValue: Accessor<T | undefined>;
  /** Whether `value` passed `validate`. */
  readonly valid: Accessor<boolean>;
};

/**
 * A value that remembers the last one that passed `validate`. It starts at `initialValue`, read
 * once, which is also the last valid value when it passes. `initialValidationState`, read once,
 * replaces the first verdict when it is a boolean; every value set after that is judged by
 * `validate`, called when the value is set. Requests made before Solid's next flush resolve to the
 * last one, and one that changes nothing writes nothing.
 *
 * ```ts
 * const [{ value, lastValidValue, valid }, setValue] = createValidatedState("", (text) => text.length > 2);
 * ```
 */
export function createValidatedState<T>(
  initialValue: MaybeAccessor<T>,
  validate: (value: NoInfer<T>) => boolean,
  initialValidationState?: MaybeAccessor<boolean | undefined>,
): [state: ValidatedState<T>, setValue: (value: T) => void] {
  const initial = accessUntracked(initialValue);
  const initiallyValid = validate(initial);
  const state = createValue({
    value: initial,
    lastValidValue: initiallyValid ? initial : undefined,
    valid: accessUntracked(initialValidationState) ?? initiallyValid,
  });
  const setValue = (value: T) => {
    const valid = validate(value);
    state.update((staged) => {
      const lastValidValue = valid ? value : staged.lastValidValue;
      return Object.is(value, staged.value) &&
        valid === staged.valid &&
        Object.is(lastValidValue, staged.lastValidValue)
        ? staged
        : { value, lastValidValue, valid };
    });
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
