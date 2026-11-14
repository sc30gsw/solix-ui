import { untrack } from "solid-js";
import { access } from "./internal-access";
import { createElementSlot } from "./internal-element";
import { sameItems } from "./internal-equal";
import { createAttachment, listen, listenerSettings } from "./internal-listener";
import type { MaybeAccessor, RefSetter } from "./types";

/** Runs with the event that completed a press, or with a listed event, outside. */
export type ClickOutsideHandler = (event: MouseEvent | TouchEvent) => void;

type Inside = readonly (Element | null | undefined)[];

type Listening = { events: readonly string[] | null; capture: boolean; inside: Element | null };

const press = ["pointerdown", "pointerup", "pointercancel"] as const;

function isOnPage(target: EventTarget | null): boolean {
  if (!(target instanceof Node) || target.ownerDocument === null) return false;
  return (
    target === target.ownerDocument.documentElement || target.ownerDocument.body.contains(target)
  );
}

function isOutside(event: Event, inside: Inside): boolean {
  if (!isOnPage(event.target)) return false;
  const present = inside.filter((node): node is Element => node !== null && node !== undefined);
  if (present.length !== inside.length) return false;
  const path = event.composedPath();
  return present.every((node) => !path.includes(node));
}

function sameListening(left: Listening, right: Listening): boolean {
  return (
    left.capture === right.capture &&
    left.inside === right.inside &&
    (left.events === null || right.events === null
      ? left.events === right.events
      : sameItems(left.events, right.events))
  );
}

function attach(
  current: Listening,
  insideNow: () => Inside,
  handler: ClickOutsideHandler,
): () => void {
  const page = document;
  if (current.events !== null) {
    const removers = current.events.map((type) =>
      listen<MouseEvent | TouchEvent>(page, listenerSettings(type, current.capture), (event) => {
        if (isOutside(event, insideNow())) handler(event);
      }),
    );
    return () => {
      for (const remove of removers) remove();
    };
  }
  const pressed: { pointer: number | undefined } = { pointer: undefined };
  const removers = [
    listen<PointerEvent>(page, listenerSettings(press[0], current.capture), (event) => {
      pressed.pointer = isOutside(event, insideNow()) ? event.pointerId : undefined;
    }),
    listen<PointerEvent>(page, listenerSettings(press[1], current.capture), (event) => {
      const began = pressed.pointer;
      pressed.pointer = undefined;
      if (began !== event.pointerId || event.defaultPrevented) return;
      if (!isOutside(event, insideNow())) return;
      event.preventDefault();
      handler(event);
    }),
    listen<PointerEvent>(page, listenerSettings(press[2], current.capture), () => {
      pressed.pointer = undefined;
    }),
  ];
  return () => {
    for (const remove of removers) remove();
  };
}

/**
 * Calls `handler` when the user presses outside an element, and returns the ref that names it.
 * With `nodes`, inside is every node in the list instead, and no ref is returned. A node that is
 * `null` or `undefined`, or a ref that has received no element, makes every press count as inside.
 *
 * With `events` left out or `null`, a press is a `pointerdown` and the `pointerup` of the same
 * pointer, both outside, as the platform's own light dismiss decides. A press that starts inside
 * and ends outside, or the reverse, does nothing (WCAG 2.5.2), and a touch that scrolls ends in
 * `pointercancel` and does nothing. The handler gets the `pointerup`. A `pointerup` whose default
 * is already prevented, by a handler on the press's path or by a region that handled it first, is
 * ignored, and a handled one has its default prevented. The listeners are on the document, so
 * regions decide in the order they were attached: the first that counts a press as outside
 * handles it, and every later one ignores it.
 *
 * With a list of `events`, such as `["mousedown", "touchstart"]`, each listed event outside calls
 * the handler on its own, whatever its default.
 *
 * Inside is decided on `composedPath()`, so content in a shadow root counts as inside its host. An
 * event whose target has left the page, removed by the same press, is never outside. `events`,
 * `enabled` (default `true`) and `capture` (default `false`) are live, and `events` is compared by
 * value. `nodes` and the handler are read when an event arrives.
 *
 * ```tsx
 * const ref = createClickOutside(() => setOpened(false));
 * return <div ref={ref}>Menu</div>;
 * ```
 */
export function createClickOutside<E extends Element = HTMLElement>(
  handler: ClickOutsideHandler,
  events?: MaybeAccessor<readonly string[] | null | undefined>,
  nodes?: null,
  enabled?: MaybeAccessor<boolean>,
  capture?: MaybeAccessor<boolean>,
): RefSetter<E>;
export function createClickOutside(
  handler: ClickOutsideHandler,
  events: MaybeAccessor<readonly string[] | null | undefined>,
  nodes: MaybeAccessor<Inside>,
  enabled?: MaybeAccessor<boolean>,
  capture?: MaybeAccessor<boolean>,
): undefined;
export function createClickOutside<E extends Element>(
  handler: ClickOutsideHandler,
  events?: MaybeAccessor<readonly string[] | null | undefined>,
  nodes?: MaybeAccessor<Inside> | null,
  enabled?: MaybeAccessor<boolean>,
  capture?: MaybeAccessor<boolean>,
): RefSetter<E> | undefined {
  const [element, ref] = createElementSlot<E>();
  const insideNow = (): Inside =>
    nodes === undefined || nodes === null ? [untrack(element)] : untrack(() => access(nodes));
  createAttachment<Listening>(
    () => {
      if (!access(enabled ?? true)) return undefined;
      const inside = nodes === undefined || nodes === null ? element() : null;
      if (inside === undefined) return undefined;
      return { events: access(events) ?? null, capture: access(capture ?? false), inside };
    },
    (current) => attach(current, insideNow, (event) => handler(event)),
    sameListening,
  );
  return nodes === undefined || nodes === null ? ref : undefined;
}
