import { access } from "./internal-access";
import { runHotkeys } from "./internal-hotkey";
import type { HotkeyItem, MaybeAccessor } from "./types";

/**
 * A `keydown` handler for one element, for a shortcut that belongs to one widget:
 * `<div onKeyDown={getHotkeyHandler([["Escape", close]])}>`. The list, or the accessor of one, is
 * read on every key, so it is never stale.
 *
 * Each item whose hotkey matches exactly runs, in order, and prevents the key's default unless its
 * options say otherwise. Matching is exact: every modifier the key carries must be named, and
 * every one named must be pressed, except `mod`, which takes Ctrl or Meta. It ignores a key whose
 * default is already prevented, so the innermost of two nested handlers handles a key and the
 * outer one leaves it, and a key pressed while an input method composes text, so confirming a
 * candidate with Enter runs no Enter hotkey. Unlike `createHotkeys`, it handles keys from inputs.
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
