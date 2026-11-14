import { access } from "./internal-access";
import { runHotkeys } from "./internal-hotkey";
import type { HotkeyItem, MaybeAccessor } from "./types";

/**
 * A `keydown` handler for one element, for a shortcut that belongs to one widget:
 * `<div onKeyDown={getHotkeyHandler([["Escape", close]])}>`. The list, or the accessor of one, is
 * read on every key, so it is never stale. The items run as `HotkeyItem` says, so of two nested
 * handlers the one the key reaches first handles it and the other leaves it. Solid delegates
 * `onKeyDown` to the root it renders into and runs the handlers from the innermost element out,
 * so the inner widget's handler runs first, and `createHotkeys`, on `window`, after them all.
 * Unlike `createHotkeys`, it handles keys from inputs.
 *
 * ```tsx
 * <div onKeyDown={getHotkeyHandler([["mod+Enter", submit], ["Escape", close]])}>
 * ```
 */
export function getHotkeyHandler(
  hotkeys: MaybeAccessor<readonly HotkeyItem[]>,
): (event: KeyboardEvent) => void {
  return (event) => runHotkeys(event, access(hotkeys));
}
