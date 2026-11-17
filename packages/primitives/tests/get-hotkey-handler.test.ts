import { expect, test } from "vite-plus/test";
import { getHotkeyHandler, type HotkeyItem } from "#/src/index.ts";

function keydown(key: string): KeyboardEvent {
  const event = new Event("keydown", { cancelable: true });
  return Object.assign(event, {
    key,
    code: "",
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    isComposing: false,
    keyCode: 0,
  }) as unknown as KeyboardEvent;
}

test("it runs the items of the list, or of the accessor of one, read on every key", () => {
  const calls: string[] = [];
  const items: HotkeyItem[] = [["a", () => calls.push("first")]];
  const handler = getHotkeyHandler(() => items);
  const event = keydown("a");

  handler(event);
  items.push(["A", () => calls.push("second"), { preventDefault: false }]);
  handler(keydown("a"));
  getHotkeyHandler([["a", () => calls.push("plain")]])(keydown("a"));
  expect(calls).toEqual(["first", "first", "second", "plain"]);
  expect(event.defaultPrevented).toBe(true);
});
