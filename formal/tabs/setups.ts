import {
  type ControlledSetup,
  tabNamesOf,
  type TabsSetup,
} from "#/apps/playground/src/sections/tabs-setups.ts";
import type { RovingList } from "#/formal/tabs/roving-list.ts";
import type { TlaValue } from "#/scripts/formal/tla-value.ts";

export type RovingConfig = {
  size: number;
  disabled: number[];
  vertical: boolean;
  rightToLeft: boolean;
  loop: boolean;
  selectsOnMove: boolean;
  deselects: boolean;
};

export function indexIn(names: readonly string[], name: string | null): number | null {
  if (name === null) return null;
  const index = names.indexOf(name);
  if (index === -1) throw new Error(`${name} is no tab of ${names.join(", ")}.`);
  return index;
}

export function rovingConfigOf(setup: TabsSetup): RovingConfig {
  return {
    size: setup.tabs.length,
    disabled: setup.tabs.flatMap(({ disabled }, index) => (disabled ? [index] : [])),
    vertical: setup.orientation === "vertical",
    rightToLeft: setup.direction === "rtl",
    loop: setup.loop,
    selectsOnMove: setup.selectsOnArrow,
    deselects: setup.deselects,
  };
}

export function rovingListOf(setup: TabsSetup): RovingList {
  const config = rovingConfigOf(setup);
  return { ...config, disabled: new Set(config.disabled) };
}

export function rovingStartOf(setup: TabsSetup): Record<string, TlaValue> {
  return {
    ...rovingConfigOf(setup),
    selected: indexIn(
      setup.tabs.map(({ name }) => name),
      setup.initial,
    ),
    focused: null,
    last: "none",
  };
}

export function controlledConfigOf(setup: ControlledSetup): Record<string, TlaValue> {
  const names = tabNamesOf(setup.list);
  return {
    size: names.length,
    follows: setup.follows,
    refused: indexIn(names, setup.refused),
  };
}

export function controlledStartOf(setup: ControlledSetup): Record<string, TlaValue> {
  return {
    ...controlledConfigOf(setup),
    value: indexIn(tabNamesOf(setup.list), setup.value),
    focused: null,
    asked: undefined,
  };
}

export function named(names: readonly string[], index: number | null): string | null {
  if (index === null) return null;
  const name = names[index];
  if (name === undefined) throw new Error(`${index} is no tab of ${names.join(", ")}.`);
  return name;
}
