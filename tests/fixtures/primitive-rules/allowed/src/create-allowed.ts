import { accessUntracked } from "../../../../../packages/primitives/src/internal-access";
import { moveFocus } from "../../../../../packages/primitives/src/internal-focus";
import { createValue } from "../../../../../packages/primitives/src/internal-value";
import type { MaybeAccessor, ReadOnce } from "../../../../../packages/primitives/src/types";

const missing = Symbol("missing");
const empty = Object.freeze([]);
const limits = { lowest: 0, names: ["a"] } as const;

export type AllowedOptions = { max?: MaybeAccessor<number>; defaultLabel?: ReadOnce<string> };

export function createAllowed(
  initialValue: ReadOnce<number>,
  element: HTMLElement,
  options?: AllowedOptions,
) {
  const initial = accessUntracked(initialValue);
  const label = accessUntracked(options?.defaultLabel);
  const value = createValue(initial);
  const items = [...(accessUntracked(initialValue) > 0 ? [initial] : limits.names)];
  const copy = (options: { max: number }) => ({ ...options });
  const open = () => element.classList.contains("open") || element.style.display !== "none";
  const clamped = () => Math.min(value.get(), accessUntracked(options?.max ?? limits.lowest));
  const focus = () => moveFocus(element);
  return [value.get, open, clamped, () => [label, missing, empty, items], copy, focus];
}
