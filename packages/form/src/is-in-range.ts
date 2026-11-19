import { failureOf } from "#/src/internal-failure.ts";
import { type FormError, type Bounds } from "#/src/types.ts";

/** Fails a value that is not a number, or a number below `bounds.min` or above `bounds.max`, with `error`, or `true` when no error is given. */
export function isInRange(bounds: Bounds, error?: FormError): (value: unknown) => FormError | null {
  return (value) =>
    typeof value === "number" &&
    !(value < (bounds.min ?? -Infinity) || value > (bounds.max ?? Infinity))
      ? null
      : failureOf(error);
}
