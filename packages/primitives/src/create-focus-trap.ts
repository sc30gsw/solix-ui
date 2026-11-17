import { access } from "#/src/internal-access.ts";
import { createElementAttachmentWhen } from "#/src/internal-attachment.ts";
import { activeElementOf, containsComposed, deepActiveElement } from "#/src/internal-active.ts";
import { focusFirst, moveFocus } from "#/src/internal-focus.ts";
import { disposeAll, watchEvents } from "#/src/internal-listener.ts";
import { isHtmlElement, isNode, isShadowRoot, viewOf } from "#/src/internal-node.ts";
import { initialFocusCandidates, tabStopCandidates } from "#/src/internal-tabbable.ts";
import type { MaybeAccessor, RefSetter } from "#/src/types.ts";

const activated = "solix-focus-trap-activated";
const released = "solix-focus-trap-released";
const focusin = "focusin";
const focusout = "focusout";
const blur = "blur";

function liesOutside(box: DOMRect, view: Window | null): boolean {
  return (
    view !== null &&
    (box.top < 0 || box.left < 0 || box.bottom > view.innerHeight || box.right > view.innerWidth)
  );
}

function frameFocusedOutside(container: HTMLElement): HTMLIFrameElement | undefined {
  const active = deepActiveElement(container.ownerDocument);
  return isHtmlElement(active) &&
    active.localName === "iframe" &&
    !containsComposed(container, active)
    ? (active as HTMLIFrameElement)
    : undefined;
}

function holdsFocus(container: HTMLElement): boolean {
  const active = activeElementOf(container);
  return active !== null && container.contains(active);
}

function comesBefore(node: Node, container: HTMLElement): boolean {
  const anchor: { at: Node } = { at: container };
  while (anchor.at.getRootNode() !== node.getRootNode()) {
    const root = anchor.at.getRootNode();
    if (!isShadowRoot(root)) break;
    anchor.at = root.host;
  }
  return (anchor.at.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_PRECEDING) !== 0;
}

function focusEdge(container: HTMLElement, last: boolean): void {
  if (!focusFirst(tabStopCandidates(container, last))) moveFocus(container);
}

function focusInitially(container: HTMLElement): void {
  const target = focusFirst(initialFocusCandidates(container), { preventScroll: true });
  if (target === undefined) {
    moveFocus(container, { preventScroll: true });
  } else if (liesOutside(target.getBoundingClientRect(), target.ownerDocument.defaultView)) {
    target.scrollIntoView({ block: "nearest", inline: "nearest" });
  }
}

function trap(container: HTMLElement): () => void {
  const token = Symbol(activated);
  const view = viewOf(container) ?? window;
  const newer = new Set<unknown>();
  const frameCheck: { pending: ReturnType<typeof setTimeout> | undefined } = {
    pending: undefined,
  };
  const bringBack = (landed: Node, fromOutsideThePage: boolean) => {
    if (newer.size === 0 && !holdsFocus(container)) {
      focusEdge(
        container,
        !fromOutsideThePage && comesBefore(activeElementOf(container) ?? landed, container),
      );
    }
  };
  const bringBackFromFrame = () => {
    const frame = frameFocusedOutside(container);
    if (frame !== undefined) bringBack(frame, false);
  };
  const bringBackFromFrameOnNextTask = () => {
    clearTimeout(frameCheck.pending);
    frameCheck.pending = setTimeout(bringBackFromFrame, 0);
  };
  const removeListeners = disposeAll([
    watchEvents(container.ownerDocument, [activated], (event) => {
      const detail: unknown = Reflect.get(event, "detail");
      if (detail !== token) newer.add(detail);
    }),
    watchEvents(container.ownerDocument, [released], (event) => {
      newer.delete(Reflect.get(event, "detail"));
    }),
    watchEvents(container.ownerDocument, [focusin], (event) => {
      if (isNode(event.target)) bringBack(event.target, event.relatedTarget === null);
    }),
    watchEvents(container, [focusout], (event) => {
      if (event.relatedTarget === null) bringBackFromFrameOnNextTask();
    }),
    watchEvents(view, [blur], () => {
      bringBackFromFrame();
      bringBackFromFrameOnNextTask();
    }),
  ]);
  container.ownerDocument.dispatchEvent(new CustomEvent(activated, { detail: token }));
  const initial = setTimeout(() => {
    if (newer.size === 0) focusInitially(container);
  }, 0);
  return () => {
    clearTimeout(initial);
    clearTimeout(frameCheck.pending);
    removeListeners();
    container.ownerDocument.dispatchEvent(new CustomEvent(released, { detail: token }));
  };
}

/**
 * Keeps keyboard focus inside the element its ref is on while `active` (default `true`, live) is
 * on, for a surface the platform does not contain. A modal `<dialog>` opened with `showModal()`
 * needs no trap.
 *
 * When the trap turns on, focus moves on the next task to the first element marked
 * `data-autofocus`, else the first tab stop, else the first focusable element, else the container,
 * without scrolling, and the element is then scrolled into view only if it lies outside the
 * viewport (WCAG 2.4.11).
 *
 * Tab and Shift+Tab are the browser's own: the trap neither reads nor prevents them, so a widget
 * inside that handles Tab itself, such as an editor that inserts a tab character, keeps it. The
 * trap watches where focus goes instead. When focus moves from an element of the page to one
 * outside the container, by Tab, a click, a script or a frame, it moves on to the container's
 * first tab stop if the element that took it follows the container in the document, and to its
 * last tab stop if it comes before. So Tab wraps at both ends. Tab and Shift+Tab can still take
 * focus off the page to the browser's own controls, as they can from a modal `<dialog>`: from a
 * trap at the page's end, and, in an engine that starts Shift+Tab from the document's selection,
 * from a trap with no tab stop while that selection lies inside it. Focus that lands outside the
 * container with nothing focused before it in the page moves to the first tab stop, so focus that
 * comes back from the browser's own controls lands in the trap. Each move is confirmed, and an
 * element that does not take focus, such as a link without `href`, is passed over for the next
 * one. With no tab stop that takes focus, focus moves to the container, so keep the container
 * focusable with `tabindex="-1"`. Engines report a move into a frame at different times, so the
 * trap also looks on the next task after focus leaves the container or the window, and brings back
 * focus that a frame outside the container holds by then.
 *
 * Only the trap turned on last guards focus: turning one on suspends every other, in any order of
 * nesting, and turning it off or disposing it resumes them. Turning `active` off releases the trap
 * at once, so the caller's Escape or close action lets focus go (WCAG 2.1.2).
 *
 * ```tsx
 * const trap = createFocusTrap(() => props.opened);
 * return <div ref={trap} role="dialog" aria-label="Filters" tabindex="-1">...</div>;
 * ```
 */
export function createFocusTrap(active?: MaybeAccessor<boolean>): RefSetter<HTMLElement> {
  return createElementAttachmentWhen<HTMLElement, HTMLElement>(
    (container) => trap(container),
    (element) => (access(active ?? true) ? element : undefined),
  );
}
