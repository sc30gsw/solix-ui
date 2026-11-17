import { untrack } from "solid-js";
import { createValue } from "#/src/internal-value.ts";

export type Request<T> = (next: T) => boolean;

export function createRequest<T>(): Request<T> {
  const slot = createValue<{ value: T } | undefined>(undefined);
  return (next) =>
    slot.update((staged) => {
      const earlierThisTick = staged === untrack(slot.get) ? undefined : staged;
      return earlierThisTick && Object.is(earlierThisTick.value, next)
        ? earlierThisTick
        : { value: next };
    }).changed;
}
