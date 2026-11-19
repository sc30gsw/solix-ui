import { failureOf } from "#/src/internal-failure.ts";
import { type FormError, type Bounds } from "#/src/types.ts";

function hasValidLength(bounds: number | Bounds, length: unknown): boolean {
  if (typeof bounds === "number") return length === bounds;
  return !(Number(length) > (bounds.max ?? Infinity) || Number(length) < (bounds.min ?? -Infinity));
}

function lengthOf(value: unknown): unknown {
  if (typeof value === "string") return value.trim().length;
  return typeof value === "object" && value !== null && "length" in value
    ? value.length
    : undefined;
}

/** Fails a value whose length is not `bounds`, or outside `bounds.min` and `bounds.max`, with `error`, or `true` when no error is given. A string is measured trimmed, and a value with no `length` fails. */
export function hasLength(
  bounds: number | Bounds,
  error?: FormError,
): (value: unknown) => FormError | null {
  return (value) => {
    const length = lengthOf(value);
    return length !== undefined && hasValidLength(bounds, length) ? null : failureOf(error);
  };
}
