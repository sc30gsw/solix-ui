import fc from "fast-check";
import { expect, test } from "vite-plus/test";
import {
  codeName,
  isComposing,
  type KeyChord,
  keyName,
  matchesHotkey,
  parseHotkey,
  runHotkeys,
} from "#/src/internal-hotkey.ts";
import type { HotkeyItem } from "#/src/types.ts";

type Modifiers = { alt: boolean; ctrl: boolean; meta: boolean; shift: boolean };
type Key = { names: readonly string[]; key: string; code: string };

const modifierKeys = ["alt", "ctrl", "meta", "shift"] as const;

const keys: readonly Key[] = [
  { names: ["k", "K"], key: "k", code: "KeyK" },
  { names: ["1"], key: "1", code: "Digit1" },
  { names: ["escape", "Esc", "ESCAPE"], key: "Escape", code: "Escape" },
  { names: ["enter", "Enter"], key: "Enter", code: "Enter" },
  { names: ["space", "Space"], key: " ", code: "Space" },
  { names: ["tab"], key: "Tab", code: "Tab" },
  { names: ["backspace"], key: "Backspace", code: "Backspace" },
  { names: ["delete"], key: "Delete", code: "Delete" },
  { names: ["arrowup", "up", "ArrowUp"], key: "ArrowUp", code: "ArrowUp" },
  { names: ["pagedown", "PageDown"], key: "PageDown", code: "PageDown" },
  { names: ["plus", "[plus]"], key: "+", code: "Equal" },
  { names: ["minus"], key: "-", code: "Minus" },
  { names: ["slash"], key: "/", code: "Slash" },
  { names: ["asterisk"], key: "*", code: "NumpadMultiply" },
];

const modifiers = fc.record({
  alt: fc.boolean(),
  ctrl: fc.boolean(),
  meta: fc.boolean(),
  shift: fc.boolean(),
});

const writtenKey = fc
  .constantFrom(...keys)
  .chain((key) => fc.tuple(fc.constant(key), fc.constantFrom(...key.names)));

const casing = fc.constantFrom(
  (text: string) => text,
  (text: string) => text.toUpperCase(),
  (text: string) => text.toLowerCase(),
  (text: string) => ` ${text} `,
);

function chord(key: Key, pressed: Modifiers): KeyChord {
  return {
    key: key.key,
    code: key.code,
    altKey: pressed.alt,
    ctrlKey: pressed.ctrl,
    metaKey: pressed.meta,
    shiftKey: pressed.shift,
  };
}

function written(named: readonly string[], key: string, order: number[]): string {
  const parts = [...named, key];
  return order.map((index) => parts[index % parts.length]).join("+");
}

function hotkeyOf(pressed: Modifiers, name: string, shuffle: number): string {
  const named = modifierKeys.filter((modifier) => pressed[modifier]);
  const parts = [...named, name];
  const rotated = [
    ...parts.slice(shuffle % parts.length),
    ...parts.slice(0, shuffle % parts.length),
  ];
  return rotated.join("+");
}

test("a hotkey written with any casing, alias or order of its parts matches exactly the key it names with exactly its modifiers", () => {
  fc.assert(
    fc.property(modifiers, writtenKey, casing, fc.nat(), (pressed, [key, name], cased, shuffle) => {
      const hotkey = parseHotkey(cased(hotkeyOf(pressed, name, shuffle)));

      expect(matchesHotkey(hotkey, chord(key, pressed), false)).toBe(true);
      for (const modifier of modifierKeys) {
        const flipped = { ...pressed, [modifier]: !pressed[modifier] };
        expect(matchesHotkey(hotkey, chord(key, flipped), false), `${modifier} flipped`).toBe(
          false,
        );
      }
    }),
  );
});

test("a hotkey matches no other key", () => {
  fc.assert(
    fc.property(modifiers, writtenKey, fc.constantFrom(...keys), (pressed, [key, name], other) => {
      fc.pre(other !== key);
      const hotkey = parseHotkey(hotkeyOf(pressed, name, 0));

      expect(matchesHotkey(hotkey, chord(other, pressed), false)).toBe(false);
      expect(matchesHotkey(hotkey, chord(other, pressed), true)).toBe(false);
    }),
  );
});

test("mod matches Ctrl, Meta or both, and nothing without either", () => {
  fc.assert(
    fc.property(
      fc.record({ alt: fc.boolean(), shift: fc.boolean() }),
      fc.boolean(),
      fc.boolean(),
      writtenKey,
      (rest, ctrl, meta, [key, name]) => {
        const named = [...(rest.alt ? ["alt"] : []), ...(rest.shift ? ["shift"] : []), "mod"];
        const hotkey = parseHotkey(written(named, name, [...named.keys(), named.length]));

        expect(matchesHotkey(hotkey, chord(key, { ...rest, ctrl, meta }), false)).toBe(
          ctrl || meta,
        );
      },
    ),
  );
});

test("with physical keys, a letter or digit matches its code whatever character the layout gives, and a digit does not match the numpad", () => {
  fc.assert(
    fc.property(
      modifiers,
      fc.constantFrom("a", "q", "z", "0", "7"),
      fc.string({ minLength: 1, maxLength: 2 }),
      (pressed, name, character) => {
        const isDigit = /^\d$/.test(name);
        const code = isDigit ? `Digit${name}` : `Key${name.toUpperCase()}`;
        const hotkey = parseHotkey(hotkeyOf(pressed, name.toUpperCase(), 1));
        const typed = { ...chord({ names: [], key: character, code }, pressed) };

        expect(matchesHotkey(hotkey, typed, true)).toBe(true);
        if (isDigit) {
          expect(matchesHotkey(hotkey, { ...typed, code: `Numpad${name}` }, true)).toBe(false);
        }
      },
    ),
  );
});

test("parsing reads the hotkey case-insensitively, and a hotkey with no key or two keys never matches", () => {
  fc.assert(
    fc.property(fc.string(), modifiers, writtenKey, (text, pressed, [key]) => {
      expect(parseHotkey(text.toUpperCase())).toEqual(parseHotkey(text.toLowerCase()));
      expect(matchesHotkey(parseHotkey(hotkeyOf(pressed, "", 0)), chord(key, pressed), false)).toBe(
        false,
      );
      expect(
        matchesHotkey(parseHotkey(hotkeyOf(pressed, "a+b", 0)), chord(key, pressed), false),
      ).toBe(false);
    }),
  );
});

test("names and codes reduce to one spelling: a space, the plus sign and the arrows by name, letters and digits by character", () => {
  expect([" ", "+", "-", "*", "/", "Esc", "ArrowUp", "up"].map(keyName)).toEqual([
    "space",
    "plus",
    "minus",
    "asterisk",
    "slash",
    "escape",
    "arrowup",
    "arrowup",
  ]);
  expect(["KeyA", "Digit1", "Numpad1", "Space", "Minus", "Slash"].map(codeName)).toEqual([
    "a",
    "1",
    "numpad1",
    "space",
    "minus",
    "slash",
  ]);
});

test("a key pressed while an input method composes text is composing, by the standard flag or the legacy key code 229", () => {
  fc.assert(
    fc.property(fc.boolean(), fc.integer({ min: 0, max: 300 }), (composing, keyCode) => {
      expect(isComposing({ isComposing: composing, keyCode })).toBe(composing || keyCode === 229);
    }),
  );
});

type Pressed = Partial<
  Pick<
    KeyboardEvent,
    "key" | "code" | "altKey" | "ctrlKey" | "metaKey" | "shiftKey" | "isComposing" | "keyCode"
  >
>;

function keydown(pressed: Pressed): KeyboardEvent {
  const event = new Event("keydown", { cancelable: true });
  return Object.assign(event, {
    key: "",
    code: "",
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    isComposing: false,
    keyCode: 0,
    ...pressed,
  }) as unknown as KeyboardEvent;
}

function recorder() {
  const calls: string[] = [];
  const item = (hotkey: string, options?: HotkeyItem[2]): HotkeyItem => [
    hotkey,
    (event) => calls.push(`${hotkey} ${event.key}`),
    options,
  ];
  return { calls, item };
}

test("runHotkeys runs every item that matches, in order, and prevents the default unless an item opts out", () => {
  const { calls, item } = recorder();
  const prevented = keydown({ key: "k", ctrlKey: true });
  const kept = keydown({ key: "k", ctrlKey: true });

  runHotkeys(prevented, [
    item("mod+k"),
    item("ctrl+K", { preventDefault: false }),
    item("shift+k"),
  ]);
  runHotkeys(kept, [item("ctrl+k", { preventDefault: false })]);
  expect(calls).toEqual(["mod+k k", "ctrl+K k", "ctrl+k k"]);
  expect([prevented.defaultPrevented, kept.defaultPrevented]).toEqual([true, false]);
});

test("runHotkeys ignores a key whose default is already prevented, so of two nested handlers the first one the key reaches handles it", () => {
  const { calls, item } = recorder();
  const event = keydown({ key: "Escape" });

  runHotkeys(event, [item("escape")]);
  runHotkeys(event, [item("esc")]);
  expect(calls).toEqual(["escape Escape"]);
});

test("runHotkeys ignores a key pressed while an input method composes text", () => {
  const { calls, item } = recorder();

  for (const pressed of [
    { key: "Enter", isComposing: true },
    { key: "Process", keyCode: 229 },
    { key: "Enter" },
  ]) {
    runHotkeys(keydown(pressed), [item("enter")]);
  }
  expect(calls).toEqual(["enter Enter"]);
});

test("runHotkeys with physical keys compares the code, so a shortcut survives another layout", () => {
  const { calls, item } = recorder();

  runHotkeys(keydown({ key: "ф", code: "KeyA", metaKey: true }), [
    item("mod+a", { usePhysicalKeys: true }),
    item("mod+a"),
  ]);
  expect(calls).toEqual(["mod+a ф"]);
});
