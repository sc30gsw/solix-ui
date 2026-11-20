import { failureOf } from "#/src/internal-status.ts";
import { type FormError } from "#/src/types.ts";

/** Fails a value that is not one of `values`, by `includes`, so `NaN` is one of a list that holds it, with `error`, or `true` when no error is given. */
export function isOneOf<Value>(
  values: readonly Value[],
  error?: FormError,
): (value: unknown) => FormError | null {
  return (value) => ((values as readonly unknown[]).includes(value) ? null : failureOf(error));
}
