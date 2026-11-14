import { access } from "./internal-access";
import { createElementSlot } from "./internal-element";
import { createAttachment, listen, listenerSettings } from "./internal-listener";
import {
  type Focusable,
  hasOwnTabStops,
  initialFocusTarget,
  isFocusable,
  nextTabStop,
} from "./internal-tabbable";
import type { MaybeAccessor, RefSetter } from "./types";

const tab = "Tab";
const keydown = "keydown";

function liesOutside(box: DOMRect, view: Window | null): boolean {
  return (
    view !== null &&
    (box.top < 0 || box.left < 0 || box.bottom > view.innerHeight || box.right > view.innerWidth)
  );
}

function focusInView(target: Focusable | undefined): void {
  if (!target) return;
  target.focus({ preventScroll: true });
  if (liesOutside(target.getBoundingClientRect(), target.ownerDocument.defaultView)) {
    target.scrollIntoView({ block: "nearest", inline: "nearest" });
  }
}

function activeIn(container: HTMLElement): Element | null {
  const root = container.getRootNode();
  return root instanceof Document || root instanceof ShadowRoot ? root.activeElement : null;
}

function trap(container: HTMLElement): () => void {
  const pending: { correction: ReturnType<typeof setTimeout> | undefined } = {
    correction: undefined,
  };
  const focusContainer = () => {
    if (isFocusable(container)) container.focus();
  };
  const initial = setTimeout(() => focusInView(initialFocusTarget(container)), 0);
  const correctAfterNativeTab = (backwards: boolean) => {
    clearTimeout(pending.correction);
    pending.correction = setTimeout(() => {
      pending.correction = undefined;
      const now = activeIn(container);
      if (now !== null && container.contains(now)) return;
      nextTabStop(container, null, backwards)?.focus();
    }, 0);
  };
  const removers = [
    listen<KeyboardEvent>(container, listenerSettings(keydown, false), (event) => {
      if (event.key !== tab || event.defaultPrevented) return;
      const current = event.target instanceof Element ? event.target : null;
      if (current !== null && current !== container && hasOwnTabStops(current)) {
        correctAfterNativeTab(event.shiftKey);
        return;
      }
      event.preventDefault();
      const next = nextTabStop(container, current, event.shiftKey);
      if (next) next.focus();
      else if (current === null || !isFocusable(current)) focusContainer();
    }),
    listen<KeyboardEvent>(container.ownerDocument, listenerSettings(keydown, false), (event) => {
      if (event.key !== tab || event.defaultPrevented) return;
      const page = container.ownerDocument;
      if (event.target !== page.body && event.target !== page.documentElement) return;
      event.preventDefault();
      const next = nextTabStop(container, null, event.shiftKey);
      if (next) next.focus();
      else focusContainer();
    }),
  ];
  return () => {
    clearTimeout(initial);
    clearTimeout(pending.correction);
    for (const remove of removers) remove();
  };
}

/**
 * Keeps keyboard focus inside the element its ref is on while `active` (default `true`, live) is
 * on, for a surface the platform does not contain. A modal `<dialog>` opened with `showModal()`
 * needs no trap.
 *
 * When the trap turns on, focus moves on the next task to the first element marked
 * `data-autofocus`, else the first tab stop, else the first focusable element, else the container
 * when it is focusable, without scrolling, and the element is then scrolled into view only if it
 * lies outside the viewport (WCAG 2.4.11).
 *
 * Tab and Shift+Tab move through the container's tab stops in the order the browser uses:
 * positive `tabindex` ascending, then document order, one stop per radio group, skipping disabled,
 * inert, hidden and `tabindex="-1"` elements. They wrap at both ends. From the container, or from
 * an element that is not a stop, they continue from its position. An element with tab stops of its
 * own, such as a date input, a media element with controls or an iframe, keeps the browser's Tab,
 * and focus that then leaves the container is brought back on the next task. With no stop, focus
 * stays where it is, or moves to the container when that element can no longer hold it, so keep
 * the container focusable with `tabindex="-1"`. A Tab pressed while nothing has focus, such as after the focused element was removed,
 * moves focus to the first stop, or with Shift to the last.
 *
 * It ignores a Tab whose default is already prevented, and prevents the default of every Tab it
 * handles. Its listener is on the container, so of two nested traps the inner one handles the Tab
 * and the outer one leaves it. A Tab pressed while nothing has focus reaches every active trap at
 * the document, and the first one attached handles it. Turning `active` off removes every
 * listener at once, so the caller's Escape or close action releases the trap (WCAG 2.1.2).
 *
 * ```tsx
 * const trap = createFocusTrap(() => props.opened);
 * return <div ref={trap} role="dialog" aria-label="Filters">...</div>;
 * ```
 */
export function createFocusTrap(active?: MaybeAccessor<boolean>): RefSetter<HTMLElement> {
  const [element, ref] = createElementSlot<HTMLElement>();
  createAttachment(
    () => (access(active ?? true) ? element() : undefined),
    (container) => trap(container),
    (left, right) => left === right,
  );
  return ref;
}
