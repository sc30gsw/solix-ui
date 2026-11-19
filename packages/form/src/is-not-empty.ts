import { failureOf } from "#/src/internal-failure.ts";
import { type FormError } from "#/src/types.ts";

/** Fails a string that is empty once trimmed, an empty list, `null`, `undefined` and `false`, with `error`, or `true` when no error is given. */
export function isNotEmpty(error?: FormError): (value: unknown) => FormError | null {
  return (value) => {
    if (typeof value === "string") return value.trim().length > 0 ? null : failureOf(error);
    if (Array.isArray(value)) return value.length > 0 ? null : failureOf(error);
    return value === null || value === undefined || value === false ? failureOf(error) : null;
  };
}
