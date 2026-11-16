import { access } from "./internal-access";
import { activePath } from "./internal-active";
import { lookUp } from "./internal-browser-api";
import { createBrowserValue } from "./internal-browser-value";
import { observe } from "./internal-dom-observer";
import { sameItems } from "./internal-equal";
import { disposeAll, watchEvents } from "./internal-listener";
import type { BrowserValue, MaybeAccessor } from "./types";

/** How deep to look for the focused element, and whether to notice it being removed. */
export type ActiveElementOptions = {
  /**
   * Follow the focused element into open shadow roots, to the element that really has focus.
   * With `false` it stops at the shadow host. Default `true`.
   */
  deep?: MaybeAccessor<boolean>;
  /**
   * Read the focused element again when nodes are removed from the body, or from a shadow root on
   * the way to it, so a focused element that is removed does not linger. Default `true`.
   */
  triggerOnRemoval?: MaybeAccessor<boolean>;
};

type ActiveElementConfig = { deep: boolean; watchRemovals: boolean };

/**
 * The element that has focus in the document, `document.activeElement`, or the body when nothing
 * has. It is read again on every `focusin`, on a `focusout` that names no element taking focus,
 * and on the window's own `blur`, as when focus moves into a frame. A `focusout` that names the
 * next element is left to that element's `focusin`, so a move from one element to another is one
 * change, not two with the body between them. Both events are heard on the document and, with
 * `deep`, on each open shadow root on the way to the focused element, since a move between two
 * elements of one shadow root sends neither event outside it. They are read in the capture phase,
 * so a widget that stops their propagation does not hide them. Its loading value is `null`, and
 * so is its value where the document leaves `activeElement` out.
 *
 * Both options are live, and a change to a different value reads the element again. Where the
 * browser has no `MutationObserver`, removals are not watched.
 *
 * ```ts
 * const active = createActiveElement();
 * ```
 */
export function createActiveElement(options?: ActiveElementOptions): BrowserValue<Element | null> {
  return createBrowserValue<Element | null, ActiveElementConfig>(
    (deliver, keep, looking) => {
      const page = document;
      const followed: { roots?: readonly ShadowRoot[]; stop: () => void } = {
        stop: () => undefined,
      };
      const read = () => {
        const path =
          lookUp(page, "activeElement") === undefined
            ? { element: null, roots: [] }
            : activePath(page, looking.deep);
        deliver(path.element);
        if (followed.roots && sameItems(followed.roots, path.roots)) return;
        followed.stop();
        followed.roots = path.roots;
        followed.stop = disposeAll([
          ...path.roots.map(watchFocus),
          ...(looking.watchRemovals ? [page.body, ...path.roots] : []).map((root) =>
            observe("MutationObserver", root, { childList: true, subtree: true }, (records) => {
              if (records.some(({ removedNodes }) => removedNodes.length > 0)) read();
            }),
          ),
        ]);
      };
      const watchFocus = (tree: Document | ShadowRoot) =>
        disposeAll([
          watchEvents(tree, ["focusin"], read),
          watchEvents(tree, ["focusout"], (event) => {
            if (event.relatedTarget === null) read();
          }),
        ]);
      keep(() => followed.stop());
      read();
      keep(watchFocus(page));
      keep(watchEvents(window, ["blur"], read));
    },
    {
      loadingValue: null,
      config: () => ({
        deep: access(options?.deep ?? true),
        watchRemovals: access(options?.triggerOnRemoval ?? true),
      }),
    },
  );
}
