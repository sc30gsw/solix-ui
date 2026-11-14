import { type Accessor, createMemo } from "solid-js";
import { createValue } from "./internal-value";

/** What `toggle` takes: nothing to move to the next option, an option, or an updater that returns one. */
export type ToggleRequest<T> = T | ((current: T) => T);

/** `[value, toggle]`. */
export type ToggleReturn<T> = [value: Accessor<T>, toggle: (next?: ToggleRequest<T>) => void];

/**
 * A value that cycles through `options`, `[false, true]` by default. The options are read once, and
 * the value starts at the first.
 *
 * `toggle()` moves to the next option and wraps around after the last. `toggle(option)` moves to
 * that option, and the next `toggle()` continues from there. `toggle(updater)` moves to the option
 * that the updater returns for the current value. A value that is not one of the options does
 * nothing, and so does the current value. Requests made before Solid's next flush resolve to the
 * last one, so `toggle(); toggle()` with two options ends where it started.
 *
 * ```ts
 * const [theme, toggleTheme] = createToggle(["light", "dark", "contrast"]);
 * ```
 */
export function createToggle(): ToggleReturn<boolean>;
export function createToggle<T>(options: readonly T[]): ToggleReturn<T>;
export function createToggle<T>(options?: readonly T[]): ToggleReturn<T> {
  const list = [...(options ?? [false, true])] as T[];
  const index = createValue(0);
  const value = createMemo(() => list[index.get()]);
  const toggle = (next?: ToggleRequest<T>) => {
    index.update((staged) => {
      if (list.length === 0) return staged;
      if (next === undefined) return (staged + 1) % list.length;
      const option = typeof next === "function" ? (next as (current: T) => T)(list[staged]) : next;
      const found = list.indexOf(option);
      return found === -1 ? staged : found;
    });
  };
  return [value, toggle];
}
