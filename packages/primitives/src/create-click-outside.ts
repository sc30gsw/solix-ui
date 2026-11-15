import { access } from "./internal-access";
import { createElementAttachment } from "./internal-attachment";
import { disposeAll, listenAsAsked, listenerSettings, watchEvents } from "./internal-listener";
import { isNode } from "./internal-node";
import type { MaybeAccessor, RefSetter } from "./types";

type Exactly<T, U> = [T] extends [U] ? ([U] extends [T] ? true : false) : false;

/** The name of an event whose type is `MouseEvent`, `PointerEvent` or `TouchEvent`. */
export type PressEventName = {
  [K in keyof DocumentEventMap]: true extends
    | Exactly<DocumentEventMap[K], MouseEvent>
    | Exactly<DocumentEventMap[K], PointerEvent>
    | Exactly<DocumentEventMap[K], TouchEvent>
    ? K
    : never;
}[keyof DocumentEventMap];

/** Runs with the `pointerup` that completed a press outside, or with a listed event outside. */
export type ClickOutsideHandler<K extends PressEventName = "pointerup"> = (
  event: DocumentEventMap[K],
) => void;

type Listening = {
  events: readonly string[] | null;
  capture: boolean;
  inside: readonly Element[];
};

const press = { start: "pointerdown", end: "pointerup", cancel: "pointercancel" } as const;

function isPresent(node: Element | null | undefined): node is Element {
  return node !== null && node !== undefined;
}

function isOnPage(target: EventTarget | null): boolean {
  if (!isNode(target) || target.ownerDocument === null) return false;
  return (
    target === target.ownerDocument.documentElement || target.ownerDocument.body.contains(target)
  );
}

function isOutside(event: Event, inside: readonly Element[]): boolean {
  if (!isOnPage(event.target)) return false;
  const path = event.composedPath();
  return inside.every((node) => !path.includes(node));
}

function pageOf(current: Listening): Document {
  return current.inside[0]?.ownerDocument ?? document;
}

function listenToEvents(
  current: Listening,
  events: readonly string[],
  handler: (event: Event) => void,
): () => void {
  return disposeAll(
    events.map((type) =>
      listenAsAsked(pageOf(current), listenerSettings(type, current.capture), (event) => {
        if (isOutside(event, current.inside)) handler(event);
      }),
    ),
  );
}

function listenToPresses(current: Listening, handler: (event: Event) => void): () => void {
  const page = pageOf(current);
  const started = new Map<number, { target: EventTarget | null; outside: boolean }>();
  const endingOutside = new WeakSet<Event>();
  return disposeAll([
    watchEvents(page, [press.start], (event) => {
      started.set(event.pointerId, {
        target: event.target,
        outside: isOutside(event, current.inside),
      });
    }),
    ...current.inside.map((node) =>
      watchEvents(node, [press.start], (event) => {
        const start = started.get(event.pointerId);
        if (start) start.outside = false;
      }),
    ),
    watchEvents(page, [press.end], (event) => {
      const start = started.get(event.pointerId);
      started.delete(event.pointerId);
      if (start?.outside && isOnPage(start.target)) endingOutside.add(event);
    }),
    watchEvents(page, [press.cancel], (event) => {
      started.delete(event.pointerId);
    }),
    listenAsAsked(page, listenerSettings(press.end, current.capture), (event) => {
      if (endingOutside.has(event) && isOutside(event, current.inside)) handler(event);
    }),
  ]);
}

/**
 * Calls `handler` when the user presses outside the element its ref is on, and returns that ref.
 * With `nodes`, inside is every node in the list instead, and the ref is not needed. A node that
 * is `null` or `undefined`, or a ref that has received no element, makes every press count as
 * inside.
 *
 * With `events` left out or `null`, a press is a `pointerdown` and the `pointerup` of the same
 * pointer, both outside, and the handler gets the `pointerup`. A press that starts inside and ends
 * outside, or the reverse, does nothing (WCAG 2.5.2), and a touch that scrolls ends in
 * `pointercancel` and does nothing. Each pointer is followed on its own. Where a press starts is
 * read before any handler on the page runs, so a widget that stops its `pointerdown` cannot hide
 * it.
 *
 * With a list of `events`, such as `["mousedown", "touchstart"]`, each listed event outside calls
 * the handler on its own, and the handler gets that event. Only mouse, pointer and touch events
 * can be listed.
 *
 * Each region decides on its own, by containment alone: it neither reads nor prevents an event's
 * default. So a press outside two regions calls both handlers, and a press inside one and outside
 * the other calls only the other's. A component whose child layer is portaled outside its element
 * passes the layer's node through `nodes`, with its own, so a press inside the layer does not count
 * as outside the component.
 *
 * Inside is decided on `composedPath()`, so content in an open shadow root counts as inside its
 * host. A closed shadow root hides its content from that path, so there a listener on each inside
 * node tells a press that starts inside, and the rest of the press, or a listed event, is decided
 * on the path the page sees. An event whose target has left the page, removed by the same press,
 * is never outside. `events` (compared by value), `nodes` (compared by value), `enabled` (default
 * `true`) and `capture` (default `false`), which puts the listener that ends a press, or the listed
 * events' listener, in the capture phase, are live.
 *
 * ```tsx
 * const ref = createClickOutside(() => setOpened(false));
 * return <div ref={ref}>Menu</div>;
 * ```
 */
export function createClickOutside<K extends PressEventName = "pointerup">(
  handler: ClickOutsideHandler<K>,
  events?: MaybeAccessor<readonly K[] | null | undefined>,
  nodes?: MaybeAccessor<readonly (Element | null | undefined)[] | null | undefined>,
  enabled?: MaybeAccessor<boolean>,
  capture?: MaybeAccessor<boolean>,
): RefSetter<Element> {
  const call = (event: Event) => handler(event as DocumentEventMap[K]);
  return createElementAttachment<Element, Listening>(
    (element) => {
      if (!access(enabled ?? true)) return undefined;
      const listed = access(nodes ?? null) ?? [element];
      if (!listed.every(isPresent)) return undefined;
      return {
        events: access(events) ?? null,
        capture: access(capture ?? false),
        inside: listed,
      };
    },
    (current) =>
      current.events === null
        ? listenToPresses(current, call)
        : listenToEvents(current, current.events, call),
  );
}
