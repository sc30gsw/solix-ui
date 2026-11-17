import { access } from "#/src/internal-access.ts";
import { createAttachment } from "#/src/internal-attachment.ts";
import { handleEvent } from "#/src/internal-listener.ts";
import { runHotkeys } from "#/src/internal-hotkey.ts";
import { isElement, isHtmlElement } from "#/src/internal-node.ts";
import type { HotkeyItem, MaybeAccessor } from "#/src/types.ts";

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
  if (!isElement(target)) return false;
  const tag = target.tagName.toUpperCase();
  if (tagsToIgnore.some((ignored) => ignored.toUpperCase() === tag)) return true;
  return isHtmlElement(target) && target.isContentEditable && !triggerOnContentEditable;
}

/**
 * Page-wide shortcuts: one `keydown` listener on `window`, in the bubble phase, while the owner
 * lives, added once the owner's effects run, which never happens on the server. It runs after
 * every handler on the page, Solid's delegated `onKeyDown` handlers included, so a widget that
 * handles a key, such as one whose `getHotkeyHandler` closes it on Escape, prevents its default
 * and keeps it. The items run as `HotkeyItem` says.
 *
 * The list, `tagsToIgnore` and `triggerOnContentEditable` are read on every key, so an accessor
 * stays live and nothing is added again. A key is ignored when it comes from an element whose tag
 * is in `tagsToIgnore` (by default `INPUT`, `TEXTAREA` and `SELECT`), or from an editable element
 * unless `triggerOnContentEditable` is `true`. The element is the one the key was pressed in,
 * inside an open shadow root too. A closed shadow root hides it, so a key typed in an input there
 * is not ignored.
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
  createAttachment(() =>
    handleEvent(window, keydown, (event) => {
      const ignored = access(tagsToIgnore ?? defaultTagsToIgnore);
      if (isIgnoredTarget(event, ignored, access(triggerOnContentEditable ?? false))) return;
      runHotkeys(event, access(hotkeys));
    }),
  );
}
