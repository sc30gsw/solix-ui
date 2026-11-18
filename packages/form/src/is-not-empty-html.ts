import { failureOf } from "#/src/internal-validate.ts";
import { type FormError } from "#/src/types.ts";

/** Fails a value that is not a string with text left once its tags are removed and it is trimmed, with `error`, or `true` when no error is given. */
export function isNotEmptyHTML(error?: FormError): (value: unknown) => FormError | null {
  return (value) =>
    typeof value === "string" && value.replace(/<\/?[^>]+(>|$)/g, "").trim().length > 0
      ? null
      : failureOf(error);
}
