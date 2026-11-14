import type { Accessor } from "solid-js";
import { accessUntracked } from "./internal-access";
import { createValue } from "./internal-value";
import type { MaybeAccessor } from "./types";

/** What `onChange` takes: a value, an updater, or the event of a form control. */
export type InputChange<T> = T | ((current: T) => T) | Event;

/**
 * A value with one handler that takes either a value or a form control's event, so it can sit on
 * `onInput` or `onChange` as it is. It starts at `initialState`, read once.
 *
 * Given an event, it stores the `checked` of a checkbox and the `value` of any other control, read
 * from `currentTarget`, or from `target` when the event has left its handler. Given a function, it
 * stores what the function returns for the current value. Anything else, `""`, `0`, `false` and
 * `null` included, is stored as it is. Requests made before Solid's next flush resolve to the last
 * one.
 *
 * ```tsx
 * const [name, onNameInput] = createInputState("");
 * <input value={name()} onInput={onNameInput} />;
 * ```
 */
export function createInputState<T>(
  initialState: MaybeAccessor<T>,
): [value: Accessor<T>, onChange: (next: InputChange<T>) => void] {
  const value = createValue(accessUntracked(initialState));
  const fromEvent = (event: Event): T => {
    const control = event.currentTarget ?? event.target;
    if (control instanceof HTMLInputElement && control.type === "checkbox") {
      return control.checked as T;
    }
    return (control as HTMLInputElement | null)?.value as T;
  };
  const onChange = (next: InputChange<T>) => {
    value.update((staged) => {
      if (next instanceof Event) return fromEvent(next);
      return typeof next === "function" ? (next as (current: T) => T)(staged) : next;
    });
  };
  return [value.get, onChange];
}
