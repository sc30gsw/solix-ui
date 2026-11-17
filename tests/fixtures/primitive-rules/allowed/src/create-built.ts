import { createMeasured } from "#/tests/fixtures/primitive-rules/allowed/src/create-measured.ts";
import type { RefSetter } from "#/packages/primitives/src/types.ts";

/** Holds what the rules allow. */
export function createBuilt(): [ref: RefSetter<HTMLElement>, width: () => number] {
  return createMeasured();
}
