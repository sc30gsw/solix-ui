import type { formRootRule } from "#/src/constants.ts";
import type { FormPathValue, Path } from "#/src/internal-paths.ts";

export type FormError = NonNullable<unknown>;

export type RuleResult = FormError | null | undefined;

export type FormErrors = Record<string, FormError>;

export type FormStatus = Record<string, boolean>;

export type ReorderPayload = { from: number; to: number };

export type Bounds = { min?: number; max?: number };

export type UrlOptions = { protocols?: readonly string[]; allowLocalhost?: boolean };

export type FormValidationResult =
  | { hasErrors: false; errors: Record<string, never> }
  | { hasErrors: true; errors: FormErrors };

export type FormFieldValidationResult =
  | { hasError: false; error: null }
  | { hasError: true; error: FormError };

export type ResolveValidationError = (error: unknown) => RuleResult;

export type Rule<Value, Values> = (
  value: Value,
  values: Values,
  path: string,
  signal: AbortSignal,
) => RuleResult | Promise<RuleResult>;

type RootRule<Value, Values> = { [formRootRule]?: Rule<Value, Values> };

type ItemRules<Item, Values> = Partial<{ [Key in keyof Item]: FormRule<Item[Key], Values> }>;

export type FormRule<Value, Values> =
  NonNullable<Value> extends readonly (infer Item)[]
    ? Rule<Value, Values> | (ItemRules<Item, Values> & RootRule<Value, Values>)
    : NonNullable<Value> extends object
      ? Rule<Value, Values> | FormRulesRecord<NonNullable<Value>, Values>
      : Rule<Value, Values>;

export type FormRulesRecord<Values, AllValues = Values> = Partial<{
  [Key in keyof Values]: FormRule<Values[Key], AllValues>;
}> &
  RootRule<Values, AllValues>;

export type FormValidateInput<Values> =
  | FormRulesRecord<Values>
  | ((
      values: Values,
    ) => Readonly<Record<string, RuleResult>> | Promise<Readonly<Record<string, RuleResult>>>);

export type LooseKeys<Values> = Path<Values> | (string & NonNullable<unknown>);

type ItemOf<List> = List extends readonly (infer Item)[] ? Item : never;

export type FormArrayElement<Values, Target extends string> = [
  ItemOf<FormPathValue<Values, Target>>,
] extends [never]
  ? unknown
  : ItemOf<FormPathValue<Values, Target>>;

export type StandardSchemaIssue = {
  readonly message: string;
  readonly path?: ReadonlyArray<PropertyKey | { readonly key: PropertyKey }> | undefined;
};

export type StandardSchemaResult = { readonly issues?: ReadonlyArray<StandardSchemaIssue> };

export type StandardSchema = {
  readonly "~standard": {
    readonly validate: (value: unknown) => StandardSchemaResult | Promise<StandardSchemaResult>;
  };
};
