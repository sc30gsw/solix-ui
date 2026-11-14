import { createMeasured } from "./create-measured";
import type { RefSetter } from "./types";

export function createBuilt(): [ref: RefSetter<HTMLElement>, width: () => number] {
  return createMeasured();
}
