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
