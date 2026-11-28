import { controlled, controlledSetupOf } from "#/apps/playground/src/sections/tabs-setups.ts";
import { controlledConfigOf } from "#/formal/tabs/setups.ts";
import { textOf, type TlaValue, varsMatch, type Vars } from "#/scripts/formal/tla-value.ts";

export const title =
  "Controlled Tabs as the playground's Controlled list, with three tabs, an app that follows every request and tab 3 refusing a click";

function tab(value: TlaValue): string {
  return typeof value === "number" ? `tab ${value + 1}` : "none";
}

export function keep(vars: Vars): boolean {
  return varsMatch(vars, controlledConfigOf(controlledSetupOf(controlled)));
}

export function state(vars: Vars): string {
  const waiting = vars.asked === undefined ? "" : `, the app is asked for ${tab(vars.asked)}`;
  return `the app holds ${tab(vars.value)}, focus on ${vars.focused === null ? "no tab" : tab(vars.focused)}${waiting}`;
}

export function step(action: string, parameters: TlaValue[]): string {
  const [parameter] = parameters;
  if (action === "click") return `you click ${tab(parameter)}`;
  if (action === "press") return `you press ${textOf(parameter)}`;
  if (action === "appSelectsNone") return "you press the app's Select none";
  return "the app hears the request";
}
