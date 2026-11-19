import { type FormError } from "#/src/types.ts";

export function failureOf(error: FormError | undefined): FormError {
  return error || true;
}
