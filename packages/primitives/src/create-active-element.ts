import { access } from "#/src/internal-access.ts";
import { activePath } from "#/src/internal-active.ts";
import { lookUp } from "#/src/internal-browser-api.ts";
import { createBrowserValue } from "#/src/internal-browser-value.ts";
import { observe } from "#/src/internal-dom-observer.ts";
import { sameItems } from "#/src/internal-equal.ts";
import { disposeAll, watchEvents } from "#/src/internal-listener.ts";
import type { BrowserValue, MaybeAccessor } from "#/src/types.ts";

/** How deep to look for the focused element, and whether to notice it being removed. */
export type ActiveElementOptions = {
  /**
   * Follow the focused element into open shadow roots, to the element that really has focus.
   * With `false` it stops at the shadow host. Default `true`.
   */
  deep?: MaybeAccessor<boolean>;
  /**
   * Read the focused element again when nodes are removed from the document, or from a shadow
   * root on the way to it, so a focused element that is removed does not linger. Default `true`.
   */
  triggerOnRemoval?: MaybeAccessor<boolean>;
};

type ActiveElementConfig = { deep: boolean; watchRemovals: boolean };

/**
 * The element that has focus in the document, `document.activeElement`, or the body when nothing
 * has. It is read again on every `focusin`, on a `focusout` that names no element taking focus,
 * and on the window's own `blur`, as when focus moves into a frame. After a `focusout` that names
 * the next element it is read once in the next task. By then that element's `focusin` has been
 * read, so a move from one element to another is one change, not two with the body between
 * them, and a move that sends no `focusin`, as from an element in a shadow root to that root's
 * own host, is followed too. Both events are heard on the document and, with `deep`, on each
 * open shadow root on the way to the focused element, since a move between two elements of one
 * shadow root sends neither event outside it. Those roots are found each time it is read after
 * one of these events, so a shadow root attached to an element that already has focus is
 * followed only once focus has left that element. The events are read in the capture phase, so
 * a widget that stops their propagation does not hide them. Its loading value is `null`, and so
 * is its value where the document leaves `activeElement` out.
 *
 * Both options are live, and a change to a different value reads the element again. With
 * `triggerOnRemoval`, a node removed while focus moves from one element to the next, as by a
 * `blur` handler, reads the body between the two. Where the browser has no `MutationObserver`,
 * removals are not watched.
 *
 * ```ts
 * const active = createActiveElement();
 * ```
 */
export function createActiveElement(options?: ActiveElementOptions): BrowserValue<Element | null> {
  return createBrowserValue<Element | null, ActiveElementConfig>(
    (deliver, keep, looking) => {
      const page = document;
      const followed: { roots: readonly ShadowRoot[]; stop: () => void } = {
        roots: [],
        stop: () => undefined,
      };
      const nextTask: { read: ReturnType<typeof setTimeout> | undefined } = { read: undefined };
      const read = () => {
        const path =
          lookUp(page, "activeElement") === undefined
            ? { element: null, roots: [] }
            : activePath(page, looking.deep);
        deliver(path.element);
        return path.roots;
      };
      const follow = () => {
        const roots = read();
        if (sameItems(followed.roots, roots)) return;
        followed.stop();
        followed.roots = roots;
        followed.stop = disposeAll(
          roots.flatMap((root) => [watchFocus(root), watchRemovals(root)]),
        );
      };
      const followInTheNextTask = () => {
        nextTask.read ??= setTimeout(() => {
          nextTask.read = undefined;
          follow();
        }, 0);
      };
      const watchFocus = (tree: Document | ShadowRoot) =>
        disposeAll([
          watchEvents(tree, ["focusin"], follow),
          watchEvents(tree, ["focusout"], (event) => {
            if (event.relatedTarget === null) follow();
            else followInTheNextTask();
          }),
        ]);
      const watchRemovals = (tree: Document | ShadowRoot) =>
        looking.watchRemovals
          ? observe("MutationObserver", tree, { childList: true, subtree: true }, (records) => {
              if (records.some(({ removedNodes }) => removedNodes.length > 0)) read();
            })
          : () => undefined;
      keep(() => followed.stop());
      keep(() => clearTimeout(nextTask.read));
      follow();
      keep(watchFocus(page));
      keep(watchRemovals(page));
      keep(watchEvents(window, ["blur"], follow));
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
