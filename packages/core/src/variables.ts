import type { Scale } from "#/src/style-prop-table.ts";

type ChildRule = {
  readonly when?: string;
  readonly path: readonly [string, ...string[]];
  readonly set: (own: string) => Readonly<Record<string, string>>;
};

export type VariableRow = {
  readonly kind: "length" | "raw";
  readonly scale?: Scale;
  readonly responsive: boolean;
  readonly children?: readonly ChildRule[];
};

export type VariableRows = Readonly<Record<string, VariableRow>>;

export type Variables<Rows extends VariableRows = VariableRows> = {
  readonly component: string;
  readonly rows: Rows;
};

export function defineVariables<const Rows extends VariableRows>(
  component: string,
  rows: Rows,
): Variables<Rows> {
  return { component, rows };
}

export function isVariables(value: unknown): value is Variables {
  return (
    typeof value === "object" &&
    value !== null &&
    "component" in value &&
    typeof value.component === "string" &&
    "rows" in value &&
    typeof value.rows === "object" &&
    value.rows !== null
  );
}
