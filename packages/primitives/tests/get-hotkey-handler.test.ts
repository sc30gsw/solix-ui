import { expect, test } from "vite-plus/test";
import { getHotkeyHandler, type HotkeyItem } from "../src/index";

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

test("it runs every item that matches, in order, and prevents the default unless an item opts out", () => {
  const { calls, item } = recorder();
  const handler = getHotkeyHandler([
    item("mod+k"),
    item("ctrl+K", { preventDefault: false }),
    item("shift+k"),
  ]);
  const prevented = keydown({ key: "k", ctrlKey: true });
  const kept = keydown({ key: "k", ctrlKey: true });

  handler(prevented);
  getHotkeyHandler([item("ctrl+k", { preventDefault: false })])(kept);
  expect(calls).toEqual(["mod+k k", "ctrl+K k", "ctrl+k k"]);
  expect([prevented.defaultPrevented, kept.defaultPrevented]).toEqual([true, false]);
});

test("it reads the list, or an accessor of one, on every key", () => {
  const { calls, item } = recorder();
  const items: HotkeyItem[] = [item("a")];
  const handler = getHotkeyHandler(() => items);

  handler(keydown({ key: "a" }));
  items.push(item("A", { preventDefault: false }));
  handler(keydown({ key: "a" }));
  expect(calls).toEqual(["a a", "a a", "A a"]);
});

test("it ignores a key whose default is already prevented, so of two nested handlers the inner one handles it", () => {
  const { calls, item } = recorder();
  const inner = getHotkeyHandler([item("escape")]);
  const outer = getHotkeyHandler([item("esc")]);
  const event = keydown({ key: "Escape" });

  inner(event);
  outer(event);
  expect(calls).toEqual(["escape Escape"]);
});

test("it ignores a key pressed while an input method composes text", () => {
  const { calls, item } = recorder();
  const handler = getHotkeyHandler([item("enter")]);

  handler(keydown({ key: "Enter", isComposing: true }));
  handler(keydown({ key: "Process", keyCode: 229 }));
  handler(keydown({ key: "Enter" }));
  expect(calls).toEqual(["enter Enter"]);
});

test("with physical keys it compares the code, so a shortcut survives another layout", () => {
  const { calls, item } = recorder();
  const handler = getHotkeyHandler([item("mod+a", { usePhysicalKeys: true }), item("mod+a")]);

  handler(keydown({ key: "ф", code: "KeyA", metaKey: true }));
  expect(calls).toEqual(["mod+a ф"]);
});
