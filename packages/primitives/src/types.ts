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

/**
 * The options of `addEventListener`: `true` means `capture`. A primitive that takes them with an
 * event type reads both live. A change of the type, `capture`, `passive`, `once` or `signal` moves
 * the listener, removed with the options it was added with. Options equal by value, such as an
 * accessor that returns a new object each time, keep it in place, with no gap and no duplicate.
 * The listener is the function passed, so read anything that changes inside it.
 */
export type ListenerOptions = boolean | AddEventListenerOptions;

/** What a hotkey item may set. Each option is read when a key is pressed. */
export type HotkeyItemOptions = {
  /** Whether a match prevents the key's default action. Default `true`. */
  preventDefault?: boolean;
  /**
   * Compare the physical key, `event.code`, instead of the character, `event.key`, so a shortcut
   * survives a change of keyboard layout. `a` then matches `KeyA` and `1` matches `Digit1`, but not
   * `Numpad1`.
   */
  usePhysicalKeys?: boolean;
};

/**
 * A hotkey, the handler it runs and its options: `["mod+K", openSearch]`. The hotkey is
 * case-insensitive and joins with `+` any of the modifiers `alt`, `ctrl`, `meta`, `shift` and
 * `mod`, which is Ctrl or Meta, to one key. A key is a character or a name such as `escape`
 * (`esc`), `enter`, `space`, `tab`, `backspace`, `delete`, `arrowup` (`up`), `plus` (`[plus]`),
 * `minus`, `asterisk` or `slash`.
 *
 * Each item whose hotkey matches runs, in the order of the list, and prevents the key's default
 * unless its options say otherwise. Matching is exact: every modifier the key carries must be
 * named, and every one named must be pressed, except `mod`, which takes Ctrl or Meta. A key whose
 * default is already prevented, or one pressed while an input method composes text, so confirming
 * a candidate with Enter, runs no item.
 */
export type HotkeyItem = readonly [
  hotkey: string,
  handler: (event: KeyboardEvent) => void,
  options?: HotkeyItemOptions,
];
