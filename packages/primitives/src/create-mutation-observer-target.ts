import { access } from "./internal-access";
import { createAttachment } from "./internal-attachment";
import { createBrowserMemo } from "./internal-browser-value";
import { observe } from "./internal-dom-observer";
import type { MaybeAccessor } from "./types";

/**
 * Calls `callback` with the mutations of `target` that `options` asks for, as
 * `createMutationObserver` does for the element its ref is on. It returns nothing.
 *
 * `target` is a node, the document included, or an accessor of one, and is live. It is read only
 * in the browser, once the page is hydrated, so an accessor may reach a node that exists only
 * there, such as `() => document.documentElement`. A target that is `null` or `undefined`
 * observes nothing, and a change of the target moves the observer. `options` is live and compared
 * by value.
 *
 * ```ts
 * createMutationObserverTarget(readDirection, { attributeFilter: ["dir"] }, () => document.documentElement);
 * ```
 */
export function createMutationObserverTarget(
  callback: MutationCallback,
  options: MaybeAccessor<MutationObserverInit>,
  target?: MaybeAccessor<Node | null | undefined>,
): void {
  const node = createBrowserMemo<Node | undefined>(() => access(target) ?? undefined, undefined);
  createAttachment<{ node: Node; init: MutationObserverInit }>(
    (current) =>
      observe("MutationObserver", current.node, current.init, (records, observer) =>
        callback(records, observer as MutationObserver),
      ),
    () => {
      const current = node();
      return current && { node: current, init: { ...access(options) } };
    },
  );
}
