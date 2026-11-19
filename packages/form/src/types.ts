import type { formRootRule } from "#/src/constants.ts";

type Leaf = string | number | boolean | bigint | symbol | null | undefined;

type Shallower = [never, 0, 1, 2, 3, 4];

type Indexes<List extends readonly unknown[]> = number extends List["length"]
  ? number
  : Exclude<keyof List, keyof unknown[]>;

type Step<Key extends string | number, Value, Depth extends number> = Value extends Leaf
  ? `${Key}`
  : `${Key}` | `${Key}.${Path<Value, Shallower[Depth]>}`;

export type Path<Values, Depth extends number = 5> = [Depth] extends [never]
  ? never
  : Values extends readonly unknown[]
    ? {
        [Key in Indexes<Values>]-?: Step<Key & (string | number), Values[Key], Depth>;
      }[Indexes<Values>]
    : { [Key in keyof Values]-?: Step<Key & string, Values[Key], Depth> }[keyof Values];

type ItemAt<Values, Segment extends string> = Segment extends `${number}`
  ? Values extends readonly (infer Item)[]
    ? Item
    : never
  : never;

export type PathValue<Values, Target extends string> = Values extends unknown
  ? Target extends `${infer Head}.${infer Rest}`
    ? Head extends keyof Values
      ? PathValue<Values[Head], Rest> | (undefined extends Values[Head] ? undefined : never)
      : PathValue<ItemAt<Values, Head>, Rest>
    : Target extends keyof Values
      ? Values[Target]
      : ItemAt<Values, Target>
  : never;

type OrUnknown<Type> = [Type] extends [never] ? unknown : Type;

export type FormPathValue<Values, Target extends string> = OrUnknown<PathValue<Values, Target>>;

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

export type FormArrayElement<Values, Target extends string> = OrUnknown<
  ItemOf<FormPathValue<Values, Target>>
>;

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
