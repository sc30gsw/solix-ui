import { account, setupOf } from "#/apps/playground/src/sections/tabs-setups.ts";
import { rovingConfigOf } from "#/formal/tabs/setups.ts";
import {
  fieldIn,
  textOf,
  type TlaValue,
  varsMatch,
  type Vars,
} from "#/scripts/formal/tla-value.ts";

export const title =
  "Stepping over a disabled tab in the playground's Account setup, with tab 2 disabled and wrapping";

function tab(value: TlaValue): string {
  return typeof value === "number" ? `tab ${value + 1}` : "no tab";
}

export function keep(vars: Vars): boolean {
  const { size, disabled, vertical, rightToLeft, loop } = rovingConfigOf(setupOf(account));
  return varsMatch(vars, { size, disabled, vertical, rightToLeft, loop });
}

export function state(vars: Vars): string {
  if (vars.stepped === null) return `focus on ${tab(vars.from)}`;
  return fieldIn(vars.stepped, "handled", "the step over") === true
    ? `the list steps focus over to ${tab(fieldIn(vars.stepped, "to", "the step over"))}`
    : "the key is left to the SDK's roving focus";
}

export function step(_action: string, _parameters: TlaValue[], from: Vars): string {
  return `you press ${textOf(from.key)}`;
}
