import { createSignal } from "solid-js";
import { expect, test } from "vite-plus/test";
import { userEvent } from "vite-plus/test/browser";
import { createClickOutside, createFocusReturn } from "../src/index";
import { axeViolations } from "./support/accessibility";
import { flush, mount, unmount } from "./support/browser-harness";
import { attached, button, focusedId } from "./support/dom";

function surface() {
  const trigger = button("trigger");
  const element = attached(document.createElement("div"));
  element.style.padding = "8px";
  const inside = button("inside", element);
  const [opened, setOpened] = createSignal(false);
  const open = () => {
    trigger.focus();
    setOpened(true);
    flush();
    inside.focus();
  };
  const close = () => {
    setOpened(false);
    flush();
  };
  return { trigger, element, inside, opened, setOpened, open, close };
}

test("closing returns focus at once to the element that had it when the surface opened, when focus is then on the body", () => {
  const { opened, open, close, inside } = surface();
  mount(() => createFocusReturn({ opened }));

  open();
  inside.remove();
  close();
  expect(focusedId()).toBe("trigger");
});

test("focus still inside the surface when it closes is returned, and without the surface it stays", () => {
  const seen: string[] = [];
  for (const withSurface of [true, false]) {
    document.body.replaceChildren();
    const { opened, open, close, element } = surface();
    mount(() => createFocusReturn({ opened, surface: withSurface ? () => element : undefined }));

    open();
    close();
    seen.push(focusedId());
    unmount();
  }
  expect(seen).toEqual(["trigger", "inside"]);
});

test("a press on a focusable element outside that closes the surface leaves focus there, and typing reaches it", async () => {
  const { opened, setOpened, open, element } = surface();
  const search = attached(document.createElement("input"));
  search.setAttribute("aria-label", "Search");
  mount(() => createFocusReturn({ opened, surface: () => element }));
  const region = mount(() => createClickOutside(() => setOpened(false), null, null, opened));
  region(element);
  flush();

  open();
  await userEvent.click(search);
  flush();
  await userEvent.keyboard("abc");
  expect([opened(), focusedId(), search.value]).toEqual([false, "INPUT", "abc"]);
});

test("nothing happens when it is created: a surface open from the start remembers nothing", () => {
  const { inside } = surface();
  const [opened, setOpened] = createSignal(true);
  mount(() => createFocusReturn({ opened }));
  inside.focus();

  setOpened(false);
  flush();
  expect(focusedId()).toBe("inside");
});

test("shouldReturnFocus is read when the surface closes, and once the owner is disposed closing returns nothing", () => {
  const { opened, open, close, inside } = surface();
  const [shouldReturnFocus, setShouldReturnFocus] = createSignal(true);
  mount(() => createFocusReturn({ opened, shouldReturnFocus }));
  const seen: string[] = [];

  open();
  setShouldReturnFocus(false);
  inside.blur();
  close();
  seen.push(focusedId());
  setShouldReturnFocus(true);
  open();
  inside.blur();
  unmount();
  close();
  seen.push(focusedId());
  expect(seen).toEqual(["nothing", "nothing"]);
});

test("an element that left the page is not focused, and that is no error; put back, it gets focus again", () => {
  const { opened, open, close, trigger, inside } = surface();
  const returnFocus = mount(() => createFocusReturn({ opened }));

  open();
  trigger.remove();
  inside.blur();
  close();
  expect(focusedId()).toBe("nothing");
  expect(() => returnFocus()).not.toThrow();
  document.body.append(trigger);
  returnFocus();
  expect(focusedId()).toBe("trigger");
});

test("returnFocus focuses the remembered element at once without scrolling, and does nothing once the owner is disposed", () => {
  const { opened, open, close, trigger, inside } = surface();
  attached(document.createElement("div")).style.height = "3000px";
  const returnFocus = mount(() => createFocusReturn({ opened, shouldReturnFocus: false }));
  open();
  window.scrollTo(0, document.body.scrollHeight);
  const scrolled = window.scrollY;
  expect(scrolled).toBeGreaterThan(0);

  returnFocus();
  expect([focusedId(), window.scrollY]).toEqual(["trigger", scrolled]);
  inside.focus();
  close();
  unmount();
  returnFocus();
  expect(focusedId()).toBe("inside");
  expect(trigger.isConnected).toBe(true);
  window.scrollTo(0, 0);
});

test("the page around a surface that returned focus has no WCAG 2.2 A or AA violation", async () => {
  const { opened, open, close, inside } = surface();
  mount(() => createFocusReturn({ opened }));

  open();
  inside.blur();
  close();
  expect(focusedId()).toBe("trigger");
  expect(await axeViolations(document.body)).toEqual([]);
});
