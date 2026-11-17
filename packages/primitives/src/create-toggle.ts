import { type Accessor, createMemo } from "solid-js";
import { accessUntracked } from "#/src/internal-access.ts";
import { createValue } from "#/src/internal-value.ts";
import type { ReadOnce } from "#/src/types.ts";

/** What `toggle` takes: nothing to move to the next option, an option, or an updater that returns one. */
export type ToggleRequest<T> = T | ((current: T) => T);

export type ToggleReturn<T> = [value: Accessor<T>, toggle: (next?: ToggleRequest<T>) => void];

/**
 * A value that cycles through `initialOptions`, `[false, true]` by default, and starts at the
 * first. The options are an array or an accessor of one.
 *
 * `toggle()` moves to the next option and wraps around after the last. `toggle(option)` moves to
 * that option, and the next `toggle()` continues from there. `toggle(updater)` moves to the option
 * that the updater returns for the current value. A value that is not one of the options changes
 * nothing, and so does the current value. Each request decides on the value staged by the requests
 * before it in the same tick; a request that changes nothing writes nothing and calls nothing. So
 * `toggle(); toggle()` with two options ends where it started.
 *
 * ```ts
 * const [theme, toggleTheme] = createToggle(["light", "dark", "contrast"]);
 * ```
 */
export function createToggle(): ToggleReturn<boolean>;
export function createToggle<T>(initialOptions: ReadOnce<readonly T[]>): ToggleReturn<T>;
export function createToggle<T>(initialOptions?: ReadOnce<readonly T[]>): ToggleReturn<T> {
  const options = [...(accessUntracked(initialOptions) ?? [false, true])] as T[];
  const index = createValue(0);
  const value = createMemo(() => options[index.get()]);
  const toggle = (next?: ToggleRequest<T>) => {
    index.update((staged) => {
      if (options.length === 0) return staged;
      if (next === undefined) return (staged + 1) % options.length;
      const option =
        typeof next === "function" ? (next as (current: T) => T)(options[staged]) : next;
      const found = options.indexOf(option);
      return found === -1 ? staged : found;
    });
  };
  return [value, toggle];
}
