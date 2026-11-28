import { optional, setupOf } from "#/apps/playground/src/sections/tabs-setups.ts";
import { rovingConfigOf } from "#/formal/tabs/setups.ts";
import { textOf, type TlaValue, varsMatch, type Vars } from "#/scripts/formal/tla-value.ts";

export const title =
  "The roving list as the playground's Optional setup, with tabs 1 and 4 disabled, wrapping, arrows that select and a click that deselects";

function tab(value: TlaValue): string {
  return typeof value === "number" ? `tab ${value + 1}` : "no tab";
}

export function keep(vars: Vars): boolean {
  return varsMatch(vars, rovingConfigOf(setupOf(optional)));
}

export function state(vars: Vars): string {
  return `${tab(vars.selected)} selected, focus on ${tab(vars.focused)}`;
}

export function step(action: string, parameters: TlaValue[]): string {
  const [parameter] = parameters;
  if (action === "click") return `you click ${tab(parameter)}`;
  if (action === "clickDisabled") return `you click the disabled ${tab(parameter)}`;
  return `you press ${textOf(parameter)}`;
}
