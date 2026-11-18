import { filterErrors } from "#/src/internal-status.ts";
import { isThenable } from "#/src/internal-validate.ts";
import {
  type FormErrors,
  type StandardSchema,
  type StandardSchemaIssue,
  type StandardSchemaResult,
} from "#/src/types.ts";

function keyOf(issue: StandardSchemaIssue): string {
  return (issue.path ?? [])
    .map((segment) => String(typeof segment === "object" ? segment.key : segment))
    .join(".");
}

function errorsOf(result: StandardSchemaResult): FormErrors {
  const errors = new Map<string, string>();
  for (const issue of result.issues ?? []) {
    const key = keyOf(issue);
    if (!errors.get(key)) errors.set(key, issue.message);
  }
  return filterErrors(Object.fromEntries(errors));
}

/** Turns a Standard Schema into a validate function, which gives each issue's message under its path joined with dots, the first issue with a message winning for a path. The function returns a promise unless `options.sync` is `true` and the schema validates synchronously. */
export function schemaResolver(
  schema: StandardSchema,
  options: { sync: true },
): (values: unknown) => FormErrors;
export function schemaResolver(
  schema: StandardSchema,
  options?: { sync?: false },
): (values: unknown) => Promise<FormErrors>;
export function schemaResolver(
  schema: StandardSchema,
  options?: { sync?: boolean },
): (values: unknown) => FormErrors | Promise<FormErrors>;
export function schemaResolver(
  schema: StandardSchema,
  options?: { sync?: boolean },
): (values: unknown) => FormErrors | Promise<FormErrors> {
  return (values) => {
    const result = schema["~standard"].validate(values);
    if (isThenable(result)) return Promise.resolve(result).then(errorsOf);
    return options?.sync === true ? errorsOf(result) : Promise.resolve(errorsOf(result));
  };
}
