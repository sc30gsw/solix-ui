import type { Accessor } from "solid-js";

/**
 * An option that can change: the value itself, or an accessor that a primitive reads where it uses
 * it, so `() => props.max` stays live. A value whose type is a function cannot travel through it,
 * since it would be called.
 */
export type MaybeAccessor<T> = T | Accessor<T>;

/**
 * An argument read once, untracked, when the primitive is created. Its name starts with `initial`,
 * `default` or `final`. It takes the value itself or an accessor, so `() => props.defaultValue`
 * forwards a prop without reading it at the top of a component. A value whose type is a function
 * cannot travel through it, since it would be called.
 */
export type ReadOnce<T> = T | Accessor<T>;

/**
 * The ref an element primitive returns. Put it on one element, alone or in a ref array:
 * `<div ref={[props.ref, trap]}>`. The primitive works on the latest element the ref received.
 * Solid never calls a ref with `null`, so an element that leaves the page stays current until
 * another element arrives or the owner is disposed.
 */
export type RefSetter<E extends Element> = (element: E) => void;

/** The options of `addEventListener`: `true` means `capture`. */
export type ListenerOptions = boolean | AddEventListenerOptions;
