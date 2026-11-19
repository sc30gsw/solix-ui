import { FORM_INDEX, formRootRule } from "#/src/constants.ts";
import {
  childOf,
  getPath,
  isAtOrUnder,
  isContainer,
  isIndexSegment,
  type PathSegments,
  splitPath,
  tagOf,
  withIndexesAs,
} from "#/src/internal-paths.ts";
import { allOrNow, isThenable, thenOrNow } from "#/src/internal-outcome.ts";
import { filterErrors, isError } from "#/src/internal-status.ts";
import {
  type FormFieldValidationResult,
  type FormValidateInput,
  type FormValidationResult,
  type ResolveValidationError,
  type Rule,
  type RuleResult,
} from "#/src/types.ts";

type Outcome = RuleResult | Promise<RuleResult>;

type AnyRule = Rule<unknown, unknown>;

type Validation = { values: unknown; resolve: ResolveValidationError; signal: AbortSignal };

const errorTags: readonly string[] = ["[object Error]", "[object DOMException]"] as const;

export function messageOf(error: unknown): string {
  if (errorTags.includes(tagOf(error))) return String(Reflect.get(Object(error), "message"));
  return isContainer(error) || typeof error === "function" ? tagOf(error) : String(error);
}

export function runRule(rule: AnyRule, path: string, validation: Validation): Outcome {
  try {
    const result = rule(
      getPath(path, validation.values),
      validation.values,
      path,
      validation.signal,
    );
    return isThenable(result)
      ? Promise.resolve(result).then(undefined, validation.resolve)
      : result;
  } catch (error) {
    return validation.resolve(error);
  }
}

function isRule(value: unknown): value is AnyRule {
  return typeof value === "function";
}

function rootRuleOf(rules: object): AnyRule | undefined {
  const rule = childOf(rules, formRootRule);
  return isRule(rule) ? rule : undefined;
}

function outcomesOf(rules: unknown, path: string, validation: Validation): [string, Outcome][] {
  if (typeof rules !== "object" || rules === null) return [];
  return Object.keys(rules).flatMap((key): [string, Outcome][] => {
    const rule: unknown = Reflect.get(rules, key);
    const rulePath = path === "" ? key : `${path}.${key}`;
    if (isRule(rule)) return [[rulePath, runRule(rule, rulePath, validation)]];
    const value = getPath(rulePath, validation.values);
    if (typeof rule !== "object" || rule === null || typeof value !== "object" || value === null) {
      return [];
    }
    const nested = Array.isArray(value)
      ? Array.from(value, (_item, index) =>
          outcomesOf(rule, `${rulePath}.${index}`, validation),
        ).flat()
      : outcomesOf(rule, rulePath, validation);
    const root = rootRuleOf(rule);
    return root ? [...nested, [rulePath, runRule(root, rulePath, validation)]] : nested;
  });
}

function resultOf(errors: Readonly<Record<string, RuleResult>>): FormValidationResult {
  const filtered = filterErrors(errors);
  return Object.keys(filtered).length === 0
    ? { hasErrors: false, errors: {} }
    : { hasErrors: true, errors: filtered };
}

export function validateValues<Values>(
  validate: FormValidateInput<Values> | undefined,
  values: Values,
  resolve: ResolveValidationError = messageOf,
  signal: AbortSignal = new AbortController().signal,
): FormValidationResult | Promise<FormValidationResult> {
  if (typeof validate === "function") {
    return thenOrNow(validate(values), resultOf);
  }
  const entries = outcomesOf(validate, "", { values, resolve, signal }).map(([path, outcome]) =>
    thenOrNow(outcome, (result): [string, RuleResult] => [path, result]),
  );
  return allOrNow(entries, (settled) => resultOf(Object.fromEntries(settled)));
}

function ruleAt(
  rules: unknown,
  segments: PathSegments,
  depth: number,
  at: string,
  walk: { values: unknown; items: number | undefined },
): AnyRule | undefined {
  if (!isContainer(rules)) return undefined;
  const segment = segments.at(depth) ?? "";
  const next = at === "" ? segment : `${at}.${segment}`;
  const last = depth === segments.length - 1;
  if (walk.items !== undefined) {
    return isIndexSegment(segment) && Number(segment) < walk.items && !last
      ? ruleAt(rules, segments, depth + 1, next, { values: walk.values, items: undefined })
      : undefined;
  }
  const child = childOf(rules, segment);
  if (last) return isRule(child) ? child : undefined;
  const value = getPath(next, walk.values);
  if (!isContainer(child) || !isContainer(value)) return undefined;
  return ruleAt(child, segments, depth + 1, next, {
    values: walk.values,
    items: Array.isArray(value) ? value.length : undefined,
  });
}

export function ruleForPath(path: string, rules: unknown, values: unknown): AnyRule | undefined {
  const segments = splitPath(path);
  return segments === undefined
    ? undefined
    : ruleAt(rules, segments, 0, "", { values, items: undefined });
}

function fieldResultOf(path: string, result: FormValidationResult): FormFieldValidationResult {
  const key = Object.keys(result.errors).find((errorKey) => isAtOrUnder(errorKey, path));
  if (key === undefined) return { hasError: false, error: null };
  return { hasError: true, error: result.errors[key] };
}

function fieldOutcomeOf(result: RuleResult): FormFieldValidationResult {
  return isError(result) ? { hasError: true, error: result } : { hasError: false, error: null };
}

export function validateFieldValue<Values>(
  path: unknown,
  validate: FormValidateInput<Values> | undefined,
  values: Values,
  resolve: ResolveValidationError = messageOf,
  signal: AbortSignal = new AbortController().signal,
): FormFieldValidationResult | Promise<FormFieldValidationResult> {
  if (typeof path !== "string") return { hasError: false, error: null };
  const rule = typeof validate === "function" ? undefined : ruleForPath(path, validate, values);
  if (rule) {
    return thenOrNow(runRule(rule, path, { values, resolve, signal }), fieldOutcomeOf);
  }
  return thenOrNow(validateValues(validate, values, resolve, signal), (result) =>
    fieldResultOf(path, result),
  );
}

export function shouldValidateOnChange(
  path: string,
  validateInputOnChange: boolean | readonly string[],
): boolean {
  if (typeof validateInputOnChange === "boolean") return validateInputOnChange;
  const general = withIndexesAs(path, FORM_INDEX);
  return general !== undefined && validateInputOnChange.includes(general);
}
