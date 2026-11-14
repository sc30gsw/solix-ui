import { access } from "./internal-access";
import { runHotkeys } from "./internal-hotkey";
import { createAttachment, listen, listenerSettings } from "./internal-listener";
import type { HotkeyItem, MaybeAccessor } from "./types";

const defaultTagsToIgnore = ["INPUT", "TEXTAREA", "SELECT"] as const;
const keydown = "keydown";

function deepTarget(event: Event): EventTarget | null {
  return event.composedPath()[0] ?? event.target;
}

function isIgnoredTarget(
  event: KeyboardEvent,
  tagsToIgnore: readonly string[],
  triggerOnContentEditable: boolean,
): boolean {
  const target = deepTarget(event);
  if (!(target instanceof Element)) return false;
  const tag = target.tagName.toUpperCase();
  if (tagsToIgnore.some((ignored) => ignored.toUpperCase() === tag)) return true;
  return target instanceof HTMLElement && target.isContentEditable && !triggerOnContentEditable;
}

/**
 * Page-wide shortcuts: one `keydown` listener on the document element while the owner lives, added
 * once the owner's effects run, which never happens on the server.
 *
 * The list, `tagsToIgnore` and `triggerOnContentEditable` are read on every key, so an accessor
 * stays live and nothing is added again. Each item whose hotkey matches exactly runs, in order,
 * and prevents the key's default unless its options say otherwise. Matching is exact: every
 * modifier the key carries must be named, and every one named must be pressed, except `mod`,
 * which takes Ctrl or Meta.
 *
 * A key is ignored when it comes from an element whose tag is in `tagsToIgnore` (by default
 * `INPUT`, `TEXTAREA` and `SELECT`), from an editable element unless `triggerOnContentEditable` is
 * `true`, while an input method composes text, so confirming a candidate with Enter runs no Enter
 * hotkey, or when its default is already prevented, so a widget that handled the key, such as one
 * whose `getHotkeyHandler` closed it on Escape, keeps it. The target is the element the key was
 * pressed in, inside a shadow root too.
 *
 * ```ts
 * createHotkeys([["mod+K", openSearch], ["shift+?", openHelp, { preventDefault: false }]]);
 * ```
 */
export function createHotkeys(
  hotkeys: MaybeAccessor<readonly HotkeyItem[]>,
  tagsToIgnore?: MaybeAccessor<readonly string[]>,
  triggerOnContentEditable?: MaybeAccessor<boolean>,
): void {
  createAttachment(
    () => listenerSettings(keydown, false),
    (settings) =>
      listen<KeyboardEvent>(document.documentElement, settings, (event) => {
        const ignored = access(tagsToIgnore ?? defaultTagsToIgnore);
        if (isIgnoredTarget(event, ignored, access(triggerOnContentEditable ?? false))) return;
        runHotkeys(event, access(hotkeys));
      }),
    () => true,
  );
}
