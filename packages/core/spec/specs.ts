import type { Spec } from "#/spec/format.ts";
import { spec as button } from "#/spec/Button.ts";
import { spec as decisions } from "#/spec/decisions.ts";
import { spec as foundations } from "#/spec/foundations.ts";

export const functionSpecs: readonly Spec[] = [foundations, decisions, button];
