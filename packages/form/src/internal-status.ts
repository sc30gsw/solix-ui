import { isNestedUnder } from "#/src/internal-lists.ts";
import { type FormErrors, type FormStatus, type RuleResult } from "#/src/types.ts";

export function getStatus(status: Readonly<FormStatus>, path?: string): boolean {
  const keys = Object.keys(status);
  if (path === undefined) return keys.some((key) => status[key]);
  return status[path] === true || keys.some((key) => isNestedUnder(key, path) && status[key]);
}

function isError(entry: [string, RuleResult]): entry is [string, NonNullable<RuleResult>] {
  return entry[1] !== undefined && entry[1] !== null && entry[1] !== false;
}

export function filterErrors(errors: Readonly<Record<string, RuleResult>>): FormErrors {
  return Object.fromEntries(Object.entries(errors).filter(isError));
}
