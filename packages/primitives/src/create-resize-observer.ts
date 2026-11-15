import { access } from "./internal-access";
import { createElementValue } from "./internal-attachment";
import { lookUp } from "./internal-browser-api";
import { observe } from "./internal-dom-observer";
import { viewOf } from "./internal-node";
import type { BrowserValue, MaybeAccessor, ObserverRect, RefSetter } from "./types";

/** The ref to put on the element, and its box as `ObserverRect` says. */
export type ResizeObserverReturn<E extends Element> = [
  ref: RefSetter<E>,
  rect: BrowserValue<ObserverRect>,
];

const emptyRect: ObserverRect = Object.freeze({
  x: 0,
  y: 0,
  width: 0,
  height: 0,
  top: 0,
  left: 0,
  bottom: 0,
  right: 0,
});

const devicePixels = "device-pixel-content-box";

function isVertical(element: Element): boolean {
  const view = viewOf(element);
  return view !== null && !view.getComputedStyle(element).writingMode.startsWith("horizontal");
}

function sizesOf(
  entry: ResizeObserverEntry,
  box: ResizeObserverBoxOptions,
): readonly ResizeObserverSize[] | undefined {
  return box === "border-box" ? entry.borderBoxSize : entry.devicePixelContentBoxSize;
}

function sizeOf(
  entry: ResizeObserverEntry,
  box: ResizeObserverBoxOptions | undefined,
): { width: number; height: number } | undefined {
  if (box === undefined || box === "content-box") {
    return { width: entry.contentRect.width, height: entry.contentRect.height };
  }
  const size = sizesOf(entry, box)?.[0];
  if (size === undefined) return undefined;
  return isVertical(entry.target)
    ? { width: size.blockSize, height: size.inlineSize }
    : { width: size.inlineSize, height: size.blockSize };
}

function rectOf(entry: ResizeObserverEntry, box: ResizeObserverBoxOptions | undefined) {
  const size = sizeOf(entry, box);
  return (
    size && {
      x: entry.contentRect.x,
      y: entry.contentRect.y,
      width: size.width,
      height: size.height,
      top: entry.contentRect.top,
      left: entry.contentRect.left,
      bottom: entry.contentRect.bottom,
      right: entry.contentRect.right,
    }
  );
}

function watchesBox(element: Element, box: ResizeObserverBoxOptions | undefined): boolean {
  if (box !== devicePixels) return true;
  const entryClass = lookUp(viewOf(element), "ResizeObserverEntry");
  return entryClass !== undefined && Reflect.has(entryClass.prototype, "devicePixelContentBoxSize");
}

function watchSize(
  element: Element,
  box: ResizeObserverBoxOptions | undefined,
  deliver: (rect: ObserverRect) => void,
): () => void {
  const view = viewOf(element);
  if (view === null || !watchesBox(element, box)) return () => undefined;
  const frame = { pending: 0 };
  const stop = observe(
    "ResizeObserver",
    element,
    box === undefined ? undefined : { box },
    (entries) => {
      const entry = entries.at(-1);
      if (entry === undefined) return;
      view.cancelAnimationFrame(frame.pending);
      frame.pending = view.requestAnimationFrame(() => {
        const rect = rectOf(entry, box);
        if (rect) deliver(rect);
      });
    },
  );
  return () => {
    view.cancelAnimationFrame(frame.pending);
    stop();
  };
}

/**
 * Watches the box of the element its ref is on, and returns that ref and the box. The box is all
 * zeros on the server, until the observer first reports, once the owner's effects run and the ref
 * has an element, and when the ref moves to another element, until that one's first report. It
 * stays all zeros where the browser has no `ResizeObserver`, or cannot watch the box asked for.
 *
 * Each report waits for the next animation frame, and a newer report in the meantime replaces it,
 * so a burst of resizes writes the box once per frame. `options` is live and compared by value: a
 * change of `box` watches the new box. `width` and `height` are the physical width and height of
 * the box `box` names, the content box by default, in any writing mode.
 *
 * ```tsx
 * const [ref, rect] = createResizeObserver();
 * return <div ref={ref}>{rect().width}</div>;
 * ```
 */
export function createResizeObserver<E extends Element = Element>(
  options?: MaybeAccessor<ResizeObserverOptions | undefined>,
): ResizeObserverReturn<E> {
  return createElementValue<E, ObserverRect, ResizeObserverBoxOptions | undefined>(
    emptyRect,
    (element, box, deliver) => watchSize(element, box, deliver),
    () => access(options)?.box,
  );
}
