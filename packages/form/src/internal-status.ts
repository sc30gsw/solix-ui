import { isAtOrUnder } from "#/src/internal-paths.ts";
import { type FormError, type FormErrors, type FormStatus, type RuleResult } from "#/src/types.ts";

export function getStatus(status: Readonly<FormStatus>, path?: string): boolean {
  const keys = Object.keys(status);
  if (path === undefined) return keys.some((key) => status[key]);
  return keys.some((key) => isAtOrUnder(key, path) && status[key]);
}

export function isError(result: RuleResult): result is FormError {
  return result !== undefined && result !== null && result !== false;
}

function isErrorEntry(entry: [string, RuleResult]): entry is [string, FormError] {
  return isError(entry[1]);
}

export function filterErrors(
  errors: Readonly<Record<string, RuleResult>> | null | undefined,
): FormErrors {
  if (typeof errors !== "object" || errors === null) return {};
  return Object.fromEntries(Object.entries(errors).filter(isErrorEntry));
}

export function failureOf(error: RuleResult): FormError {
  return isError(error) ? error : true;
}
