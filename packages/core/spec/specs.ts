import type { LookSpec, Spec } from "#/spec/format.ts";
import { spec as button } from "#/spec/Button.ts";
import { spec as decisions } from "#/spec/decisions.ts";
import { spec as foundations } from "#/spec/foundations.ts";
import { spec as buttonLook } from "#/spec/look/Button.ts";
import { spec as foundationsLook } from "#/spec/look/foundations.ts";

export const functionSpecs: readonly Spec[] = [foundations, decisions, button];

export const lookSpecs: readonly LookSpec[] = [foundationsLook, buttonLook];
