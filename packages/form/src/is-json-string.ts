import { failureOf } from "#/src/internal-status.ts";
import { type FormError } from "#/src/types.ts";

/** Fails a value that is not a string `JSON.parse` reads, with `error`, or `true` when no error is given. */
export function isJSONString(error?: FormError): (value: unknown) => FormError | null {
  return (value) => {
    if (typeof value !== "string") return failureOf(error);
    try {
      JSON.parse(value);
      return null;
    } catch {
      return failureOf(error);
    }
  };
}
