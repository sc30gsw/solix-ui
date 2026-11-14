import { accessUntracked } from "./internal-access";
import { moveFocus } from "./internal-focus";
import { createValue } from "./internal-value";
import type { MaybeAccessor, ReadOnce } from "./types";

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
  const browser = () => (typeof globalThis === "object" ? element.ownerDocument : undefined);
  return [value.get, open, clamped, () => [label, missing, empty, items], copy, focus, browser];
}
