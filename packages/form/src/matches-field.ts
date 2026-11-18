import { failureOf } from "#/src/internal-validate.ts";
import { type FormError } from "#/src/types.ts";

/** Fails a value that is not identical to the value of `field` in the form's values, or when the values have no `field`, with `error`, or `true` when no error is given. */
export function matchesField<Values>(
  field: keyof Values,
  error?: FormError,
): (value: unknown, values: Values) => FormError | null {
  return (value, values) =>
    typeof values === "object" && values !== null && field in values && value === values[field]
      ? null
      : failureOf(error);
}
