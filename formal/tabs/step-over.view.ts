import { account } from "#/formal/tabs/tabs-configs.ts";
import { formatValue, textOf, type TlaValue, type Vars } from "#/tests/support/formal-graph.ts";

export const title =
  "Stepping over a disabled tab in the playground's Account setup, with tab 2 disabled and wrapping";

function tab(value: TlaValue): string {
  return typeof value === "number" ? `tab ${value + 1}` : "no tab";
}

function fieldOf(value: TlaValue, field: string): TlaValue {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value[field]
    : undefined;
}

export function keep(vars: Vars): boolean {
  return (
    vars.size === account.size &&
    formatValue(vars.disabled) === formatValue([...account.disabled]) &&
    vars.vertical === account.vertical &&
    vars.rightToLeft === account.rightToLeft &&
    vars.loop === account.loop
  );
}

export function state(vars: Vars): string {
  if (vars.stepped === null) return `focus on ${tab(vars.from)}`;
  return fieldOf(vars.stepped, "handled") === true
    ? `the list steps focus over to ${tab(fieldOf(vars.stepped, "to"))}`
    : "the key is left to the SDK's roving focus";
}

export function step(_action: string, _parameters: TlaValue[], from: Vars): string {
  return `you press ${textOf(from.key)}`;
}
