import { matches } from "#/src/matches.ts";
import { type FormError } from "#/src/types.ts";

/** Fails a value that is not an email address, a name, `@`, a domain and a top-level domain of two letters or more, with `error`, or `true` when no error is given. */
export function isEmail(error?: FormError): (value: unknown) => FormError | null {
  return matches(/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/, error);
}
