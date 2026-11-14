import type { Accessor } from "solid-js";

/**
 * An argument that can change: the value itself, or an accessor that a primitive reads where it
 * tracks. An argument whose name starts with `initial`, `default` or `final` is read once, when the
 * primitive is created, so `() => props.defaultValue` forwards a prop without reading it at the top
 * of a component. A value whose type is a function cannot travel through it, since it would be
 * called.
 */
export type MaybeAccessor<T> = T | Accessor<T>;
