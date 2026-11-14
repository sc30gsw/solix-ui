import { type Accessor, untrack } from "solid-js";
import type { MaybeAccessor } from "./types";

export function access<T>(value: MaybeAccessor<T>): T {
  return typeof value === "function" ? (value as Accessor<T>)() : value;
}

export function accessOnce<T>(value: MaybeAccessor<T>): T {
  return untrack(() => access(value));
}
