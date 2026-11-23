import { controlledConfig } from "#/formal/tabs/tabs-configs.ts";
import { textOf, type TlaValue, type Vars } from "#/tests/support/formal-graph.ts";

export const title =
  "Controlled Tabs as the playground's Controlled list, with three tabs, an app that follows every request and tab 3 refusing a click";

function tab(value: TlaValue): string {
  return typeof value === "number" ? `tab ${value + 1}` : "none";
}

export function keep(vars: Vars): boolean {
  return (
    vars.size === controlledConfig.size &&
    vars.follows === controlledConfig.follows &&
    vars.refused === controlledConfig.refused
  );
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
