import { createSignal } from "solid-js";
import { expect, test } from "vite-plus/test";
import { userEvent } from "vite-plus/test/browser";
import { createHotkeys, getHotkeyHandler, type HotkeyItem } from "../src/index";
import { attached, flush, mount, unmount } from "./support/browser-harness";

function recorder() {
  const calls: string[] = [];
  const item = (hotkey: string, options?: HotkeyItem[2]): HotkeyItem => [
    hotkey,
    () => calls.push(hotkey),
    options,
  ];
  return { calls, item };
}

function focusable<K extends keyof HTMLElementTagNameMap>(tag: K): HTMLElementTagNameMap[K] {
  const element = attached(document.createElement(tag));
  element.tabIndex = 0;
  element.focus();
  return element;
}

function defaultsSeen(): boolean[] {
  const seen: boolean[] = [];
  window.addEventListener("keydown", (event) => seen.push(event.defaultPrevented));
  return seen;
}

test("a hotkey runs on its exact chord from the real keyboard: mod takes Ctrl or Meta, and an extra modifier fails", async () => {
  const { calls, item } = recorder();
  mount(() => createHotkeys([item("mod+K"), item("alt+shift+ArrowUp"), item("Escape")]));
  focusable("div");

  await userEvent.keyboard("{Control>}k{/Control}");
  await userEvent.keyboard("{Meta>}k{/Meta}");
  await userEvent.keyboard("{Control>}{Shift>}k{/Shift}{/Control}");
  await userEvent.keyboard("{Alt>}{Shift>}{ArrowUp}{/Shift}{/Alt}");
  await userEvent.keyboard("{Shift>}{ArrowUp}{/Shift}");
  await userEvent.keyboard("{Escape}");
  expect(calls).toEqual(["mod+K", "mod+K", "alt+shift+ArrowUp", "Escape"]);
});

test("every matching item runs in order, and a match prevents the key's default unless its item opts out", async () => {
  const { calls, item } = recorder();
  mount(() =>
    createHotkeys([item("ctrl+s"), item("mod+s"), item("ctrl+p", { preventDefault: false })]),
  );
  focusable("div");
  const seen = defaultsSeen();

  await userEvent.keyboard("{Control>}s{/Control}");
  await userEvent.keyboard("{Control>}p{/Control}");
  expect(calls).toEqual(["ctrl+s", "mod+s", "ctrl+p"]);
  expect(seen).toEqual([false, true, false, false]);
});

test("keys typed in an input, a textarea, a select or an editable element are ignored by default", async () => {
  const { calls, item } = recorder();
  mount(() => createHotkeys([item("a")]));

  for (const tag of ["input", "textarea", "select"] as const) {
    focusable(tag);
    await userEvent.keyboard("a");
  }
  const editable = focusable("div");
  editable.contentEditable = "true";
  editable.focus();
  await userEvent.keyboard("a");
  expect(calls).toEqual([]);
});

test("tagsToIgnore and triggerOnContentEditable are live and read on every key", async () => {
  const { calls, item } = recorder();
  const [tags, setTags] = createSignal<readonly string[]>(["textarea"]);
  const [editable, setEditable] = createSignal(false);
  mount(() => createHotkeys([item("a")], tags, editable));

  focusable("input");
  await userEvent.keyboard("a");
  focusable("textarea");
  await userEvent.keyboard("a");
  setTags([]);
  flush();
  await userEvent.keyboard("a");
  const element = focusable("div");
  element.contentEditable = "true";
  element.focus();
  await userEvent.keyboard("a");
  setEditable(true);
  flush();
  await userEvent.keyboard("a");
  expect(calls).toEqual(["a", "a", "a"]);
});

test("an input inside a shadow root is ignored too", async () => {
  const { calls, item } = recorder();
  mount(() => createHotkeys([item("a")]));
  const host = attached(document.createElement("div"));
  const input = document.createElement("input");
  host.attachShadow({ mode: "open" }).append(input);
  input.focus();

  await userEvent.keyboard("a");
  expect(calls).toEqual([]);
});

test("a key pressed while an input method composes text is ignored, by the standard flag or the legacy key code", () => {
  const { calls, item } = recorder();
  mount(() => createHotkeys([item("enter")]));
  const target = focusable("div");
  const legacy = new KeyboardEvent("keydown", { key: "Process", bubbles: true, cancelable: true });
  Object.defineProperty(legacy, "keyCode", { value: 229 });

  target.dispatchEvent(
    new KeyboardEvent("keydown", {
      key: "Enter",
      isComposing: true,
      bubbles: true,
      cancelable: true,
    }),
  );
  target.dispatchEvent(legacy);
  target.dispatchEvent(
    new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }),
  );
  expect(calls).toEqual(["enter"]);
});

test("a key whose default a widget already prevented is left to that widget", async () => {
  const { calls, item } = recorder();
  mount(() => createHotkeys([item("escape")]));
  const widget = focusable("div");
  widget.addEventListener("keydown", getHotkeyHandler([["Escape", () => calls.push("widget")]]));

  await userEvent.keyboard("{Escape}");
  expect(calls).toEqual(["widget"]);
});

test("with physical keys a shortcut follows the key's position, not the character the layout gives", () => {
  const { calls, item } = recorder();
  mount(() => createHotkeys([item("mod+a", { usePhysicalKeys: true }), item("mod+a")]));
  const target = focusable("div");

  target.dispatchEvent(
    new KeyboardEvent("keydown", { key: "ф", code: "KeyA", ctrlKey: true, bubbles: true }),
  );
  expect(calls).toEqual(["mod+a"]);
});

test("the list is read on every key, so an accessor stays live, and the listener goes when the owner is disposed", async () => {
  const { calls, item } = recorder();
  const [items, setItems] = createSignal<readonly HotkeyItem[]>([item("a")]);
  mount(() => createHotkeys(items));
  focusable("div");

  await userEvent.keyboard("a");
  setItems([item("b")]);
  flush();
  await userEvent.keyboard("a");
  await userEvent.keyboard("b");
  unmount();
  await userEvent.keyboard("b");
  expect(calls).toEqual(["a", "b"]);
});

test("getHotkeyHandler handles keys from inputs, and of two nested elements the inner one handles a key and the outer one leaves it", async () => {
  const calls: string[] = [];
  const outer = attached(document.createElement("div"));
  const input = document.createElement("input");
  outer.append(input);
  outer.addEventListener("keydown", getHotkeyHandler([["Escape", () => calls.push("outer")]]));
  input.addEventListener("keydown", getHotkeyHandler([["Escape", () => calls.push("inner")]]));
  input.focus();

  await userEvent.keyboard("{Escape}");
  outer.tabIndex = 0;
  outer.focus();
  await userEvent.keyboard("{Escape}");
  expect(calls).toEqual(["inner", "outer"]);
});
