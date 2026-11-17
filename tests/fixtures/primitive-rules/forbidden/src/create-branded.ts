import type { BrowserValue, BrowserValue as Live } from "#/packages/primitives/src/types.ts";

/** Holds what the rules forbid. */
export function createBranded(): BrowserValue<number>[] {
  return [
    (() => 0) as BrowserValue<number>,
    (() => 0) as never,
    (() => 0) as Live<number>,
    (() => 0) as unknown as BrowserValue<number>,
  ];
}
