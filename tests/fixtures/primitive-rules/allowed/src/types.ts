export type BrowserValue<T> = (() => T) & { readonly browserValue?: T };
export type MaybeAccessor<T> = T | (() => T);
export type ReadOnce<T> = T | (() => T);
export type RefSetter<E extends Element> = (element: E) => void;
