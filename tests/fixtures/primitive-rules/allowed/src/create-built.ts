import { createMeasured } from "./create-measured";
import type { RefSetter } from "../../../../../packages/primitives/src/types";

/** Holds what the rules allow. */
export function createBuilt(): [ref: RefSetter<HTMLElement>, width: () => number] {
  return createMeasured();
}
