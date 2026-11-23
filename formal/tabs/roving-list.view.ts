import { optional } from "#/formal/tabs/tabs-configs.ts";
import { formatValue, textOf, type TlaValue, type Vars } from "#/tests/support/formal-graph.ts";

export const title =
  "The roving list as the playground's Optional setup, with tabs 1 and 4 disabled, wrapping, arrows that select and a click that deselects";

function tab(value: TlaValue): string {
  return typeof value === "number" ? `tab ${value + 1}` : "no tab";
}

export function keep(vars: Vars): boolean {
  return (
    vars.size === optional.size &&
    formatValue(vars.disabled) === formatValue([...optional.disabled]) &&
    vars.vertical === optional.vertical &&
    vars.rightToLeft === optional.rightToLeft &&
    vars.loop === optional.loop &&
    vars.selectsOnMove === optional.selectsOnMove &&
    vars.deselects === optional.deselects
  );
}

export function state(vars: Vars): string {
  return `${tab(vars.selected)} selected, focus on ${tab(vars.focused)}`;
}

export function step(action: string, parameters: TlaValue[]): string {
  const [parameter] = parameters;
  return action === "click" ? `you click ${tab(parameter)}` : `you press ${textOf(parameter)}`;
}
