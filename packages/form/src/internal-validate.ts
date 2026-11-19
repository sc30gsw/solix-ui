import { FORM_INDEX, formRootRule } from "#/src/constants.ts";
import {
  childOf,
  getPath,
  isIndexSegment,
  type PathSegments,
  splitPath,
} from "#/src/internal-paths.ts";
import { filterErrors, isError } from "#/src/internal-status.ts";
import {
  type FormError,
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

export function isThenable(value: unknown): value is PromiseLike<unknown> {
  return (
    (typeof value === "object" || typeof value === "function") &&
    value !== null &&
    typeof Reflect.get(value, "then") === "function"
  );
}

export function messageOf(error: unknown): string {
  return Object.prototype.toString.call(error) === "[object Error]"
    ? String(Reflect.get(Object(error), "message"))
    : String(error);
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
      ? Promise.resolve(result).then((value) => value, validation.resolve)
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

function settled(outcomes: [string, Outcome][]): Promise<FormValidationResult> {
  return Promise.all(
    outcomes.map(async ([path, outcome]): Promise<[string, RuleResult]> => [path, await outcome]),
  ).then((entries) => resultOf(Object.fromEntries(entries)));
}

function settledNow(outcomes: [string, Outcome][]): [string, RuleResult][] | undefined {
  const results = outcomes.flatMap(([path, outcome]): [string, RuleResult][] =>
    isThenable(outcome) ? [] : [[path, outcome]],
  );
  return results.length === outcomes.length ? results : undefined;
}

export function validateValues<Values>(
  validate: FormValidateInput<Values> | undefined,
  values: Values,
  resolve: ResolveValidationError = messageOf,
  signal: AbortSignal = new AbortController().signal,
): FormValidationResult | Promise<FormValidationResult> {
  if (typeof validate === "function") {
    const errors = validate(values);
    return isThenable(errors) ? Promise.resolve(errors).then(resultOf) : resultOf(errors);
  }
  const outcomes = outcomesOf(validate, "", { values, resolve, signal });
  const now = settledNow(outcomes);
  return now === undefined ? settled(outcomes) : resultOf(Object.fromEntries(now));
}

function isRecord(value: unknown): value is object {
  return typeof value === "object" && value !== null;
}

function ruleAt(
  rules: unknown,
  segments: PathSegments,
  depth: number,
  at: string,
  validation: { values: unknown; perItem: boolean },
): AnyRule | undefined {
  if (!isRecord(rules)) return undefined;
  const segment = segments.at(depth) ?? "";
  const next = at === "" ? segment : `${at}.${segment}`;
  const last = depth === segments.length - 1;
  if (validation.perItem) {
    return isIndexSegment(segment) && !last
      ? ruleAt(rules, segments, depth + 1, next, { values: validation.values, perItem: false })
      : undefined;
  }
  const child = childOf(rules, segment);
  if (last) return isRule(child) ? child : undefined;
  const value = getPath(next, validation.values);
  if (!isRecord(child) || !isRecord(value)) return undefined;
  return ruleAt(child, segments, depth + 1, next, {
    values: validation.values,
    perItem: Array.isArray(value),
  });
}

export function ruleForPath(path: string, rules: unknown, values: unknown): AnyRule | undefined {
  const segments = splitPath(path);
  return segments === undefined
    ? undefined
    : ruleAt(rules, segments, 0, "", { values, perItem: false });
}

function fieldResultOf(path: string, result: FormValidationResult): FormFieldValidationResult {
  const segments = path.split(".");
  const key = Object.keys(result.errors).find((errorKey) => {
    const errorSegments = errorKey.split(".");
    return segments.every((segment, index) => segment === errorSegments[index]);
  });
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
    const outcome = runRule(rule, path, { values, resolve, signal });
    return isThenable(outcome)
      ? Promise.resolve(outcome).then(fieldOutcomeOf)
      : fieldOutcomeOf(outcome);
  }
  const result = validateValues(validate, values, resolve, signal);
  return isThenable(result)
    ? Promise.resolve(result).then((settledResult) => fieldResultOf(path, settledResult))
    : fieldResultOf(path, result);
}

export function shouldValidateOnChange(
  path: string,
  validateInputOnChange: boolean | readonly string[],
): boolean {
  if (typeof validateInputOnChange === "boolean") return validateInputOnChange;
  return validateInputOnChange.includes(path.replace(/[.][0-9]+/g, `.${FORM_INDEX}`));
}

export function failureOf(error: FormError | undefined): FormError {
  return error || true;
}
