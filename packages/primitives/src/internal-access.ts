import { type Accessor, untrack } from "solid-js";
import type { MaybeAccessor, ReadOnce } from "./types";

export function access<T>(value: MaybeAccessor<T>): T {
  return typeof value === "function" ? (value as Accessor<T>)() : value;
}

export function accessUntracked<T>(value: MaybeAccessor<T> | ReadOnce<T>): T {
  return untrack(() => access(value));
}
