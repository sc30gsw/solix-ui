import type * as Primitives from "#/src/index.ts";

type Library = typeof Primitives;

type BrowserValueKey = keyof Primitives.BrowserValue<unknown>;

type Matches<T, Marker> = T extends unknown
  ? Marker extends "ref"
    ? T extends (...element: infer A) => void
      ? A extends [Element]
        ? true
        : never
      : never
    : BrowserValueKey extends keyof T
      ? true
      : never
  : never;

export type PrimitivesReturning<Marker extends "ref" | "browser value"> = {
  [K in keyof Library]: K extends `create${string}`
    ? Library[K] extends (...args: never[]) => infer R
      ? [Matches<R, Marker> | Matches<R[keyof R], Marker>] extends [never]
        ? never
        : K
      : never
    : never;
}[keyof Library];

export type ElementPrimitive = PrimitivesReturning<"ref">;

export type BrowserValuePrimitive = PrimitivesReturning<"browser value">;

export type PageValuePrimitive = Exclude<BrowserValuePrimitive, ElementPrimitive>;
