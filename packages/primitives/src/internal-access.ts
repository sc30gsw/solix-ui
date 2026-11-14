import { type Accessor, untrack } from "solid-js";
import type { MaybeAccessor, ReadOnce } from "./types";

export function accessUntracked<T>(value: MaybeAccessor<T> | ReadOnce<T>): T {
  return untrack(() => (typeof value === "function" ? (value as Accessor<T>)() : value));
}
