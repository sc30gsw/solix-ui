import { access } from "./internal-access";
import { activePath } from "./internal-active";
import { browserApi } from "./internal-browser-api";
import { createBrowserValue } from "./internal-browser-value";
import { observe } from "./internal-dom-observer";
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

type Looking = { deep: boolean; watchRemovals: boolean };

/**
 * The element that has focus in the document, `document.activeElement`, or the body when nothing
 * has. It is read again on every `focusin` and `focusout`, in the capture phase, so a widget that
 * stops their propagation does not hide them, and on a `blur` with no element taking focus, as
 * when the window loses it. Its loading value is `null`, and so is its value where the document
 * leaves `activeElement` out.
 *
 * Both options are live, and a change to a different value reads the element again. Where the
 * browser has no `MutationObserver`, removals are not watched.
 *
 * ```ts
 * const active = createActiveElement();
 * ```
 */
export function createActiveElement(options?: ActiveElementOptions): BrowserValue<Element | null> {
  return createBrowserValue<Element | null, Looking>(
    (deliver, keep, looking) => {
      const page = document;
      const removals = { stop: (): void => undefined };
      const read = () => {
        const path =
          browserApi(page, "activeElement") === undefined
            ? { element: null, roots: [] }
            : activePath(page, looking.deep);
        deliver(path.element);
        if (!looking.watchRemovals) return;
        removals.stop();
        removals.stop = disposeAll(
          [page.body, ...path.roots].map((root) =>
            observe("MutationObserver", root, { childList: true, subtree: true }, (records) => {
              if (records.some(({ removedNodes }) => removedNodes.length > 0)) read();
            }),
          ),
        );
      };
      keep(() => removals.stop());
      read();
      keep(watchEvents(window, "focusin", read));
      keep(watchEvents(window, "focusout", read));
      keep(
        watchEvents(window, "blur", (event) => {
          if (event.relatedTarget === null) read();
        }),
      );
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
