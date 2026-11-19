import { failureOf } from "#/src/internal-failure.ts";
import { type FormError } from "#/src/types.ts";

/** Fails a value that is not a string `regexp` matches, with `error`, or `true` when no error is given. */
export function matches(regexp: RegExp, error?: FormError): (value: unknown) => FormError | null {
  return (value) => (typeof value === "string" && regexp.test(value) ? null : failureOf(error));
}
