import { thenOrNow } from "#/src/internal-outcome.ts";
import { joinPath } from "#/src/internal-paths.ts";
import {
  type FormErrors,
  type StandardSchema,
  type StandardSchemaIssue,
  type StandardSchemaResult,
} from "#/src/types.ts";

function keyOf(issue: StandardSchemaIssue): string {
  return (issue.path ?? [])
    .map((segment) => String(typeof segment === "object" ? segment.key : segment))
    .reduce(joinPath, "");
}

function errorsOf(result: StandardSchemaResult): FormErrors {
  const errors = new Map<string, string>();
  for (const issue of result.issues ?? []) {
    const key = keyOf(issue);
    if (!errors.get(key)) errors.set(key, issue.message);
  }
  return Object.fromEntries(errors);
}

/** Turns a Standard Schema into a validate function, which gives each issue's message under its path joined with dots, the first issue with a message winning for a path. The function returns a promise unless `options.sync` is `true` and the schema validates synchronously, so with `sync` its type is `FormErrors | Promise<FormErrors>`. */
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
    const errors = thenOrNow(schema["~standard"].validate(values), errorsOf);
    return options?.sync === true ? errors : Promise.resolve(errors);
  };
}
