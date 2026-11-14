import { createSignal } from "solid-js";
import { expect, test } from "vite-plus/test";
import { userEvent } from "vite-plus/test/browser";
import { createFocusReturn } from "../src/index";
import { axeViolations } from "./support/accessibility";
import { attached, flush, mount, unmount } from "./support/browser-harness";

const returnDelay = 10;

const after = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

function button(id: string): HTMLButtonElement {
  const element = document.createElement("button");
  element.id = id;
  element.textContent = id;
  return attached(element);
}

function focusedId(): string {
  const active = document.activeElement;
  return active === null || active === document.body ? "nothing" : active.id;
}

function addSpacer(): void {
  const spacer = document.createElement("div");
  spacer.style.height = "3000px";
  attached(spacer);
}

function surface() {
  const trigger = button("trigger");
  const inside = button("inside");
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
  return { trigger, inside, opened, open, close };
}

test("closing returns focus to the element that had it when the surface opened, after 10 ms and not before", async () => {
  const { opened, open, close, inside } = surface();
  mount(() => createFocusReturn({ opened }));

  open();
  inside.blur();
  close();
  const seen = [focusedId()];
  await after(returnDelay * 3);
  seen.push(focusedId());
  expect(seen).toEqual(["nothing", "trigger"]);
});

test("focus still on the element that had it at close is returned too", async () => {
  const { opened, open, close } = surface();
  mount(() => createFocusReturn({ opened }));

  open();
  close();
  await after(returnDelay * 3);
  expect(focusedId()).toBe("trigger");
});

test("nothing happens when it is created: a surface open from the start remembers nothing", async () => {
  const { close, inside } = surface();
  const [opened, setOpened] = createSignal(true);
  mount(() => createFocusReturn({ opened }));
  inside.focus();

  setOpened(false);
  flush();
  await after(returnDelay * 3);
  expect(focusedId()).toBe("inside");
  close();
});

test("focus the user moved elsewhere in those 10 ms is left where it is", async () => {
  const { opened, open, close } = surface();
  const elsewhere = button("elsewhere");
  mount(() => createFocusReturn({ opened }));

  open();
  close();
  elsewhere.focus();
  await after(returnDelay * 3);
  expect(focusedId()).toBe("elsewhere");
});

test("a Tab pressed in those 10 ms cancels the return", async () => {
  const { opened, open, close, inside } = surface();
  mount(() => createFocusReturn({ opened }));

  open();
  inside.blur();
  close();
  await userEvent.keyboard("{Tab}");
  const seen = focusedId();
  await after(returnDelay * 3);
  expect(focusedId()).toBe(seen);
  expect(seen).not.toBe("trigger");
});

test("opening again before the return is due cancels it, and so does disposal", async () => {
  const { opened, open, close, inside } = surface();
  mount(() => createFocusReturn({ opened }));

  open();
  close();
  open();
  inside.focus();
  await after(returnDelay * 3);
  expect(focusedId()).toBe("inside");
  inside.blur();
  close();
  unmount();
  await after(returnDelay * 3);
  expect(focusedId()).toBe("nothing");
});

test("shouldReturnFocus is read when the return is due", async () => {
  const { opened, open, close, inside } = surface();
  const [shouldReturnFocus, setShouldReturnFocus] = createSignal(true);
  mount(() => createFocusReturn({ opened, shouldReturnFocus }));

  open();
  inside.blur();
  close();
  setShouldReturnFocus(false);
  await after(returnDelay * 3);
  expect(focusedId()).toBe("nothing");
});

test("an element that left the page is not focused, and that is no error; put back, it gets focus again", async () => {
  const { opened, open, close, trigger, inside } = surface();
  const returnFocus = mount(() => createFocusReturn({ opened }));

  open();
  trigger.remove();
  inside.blur();
  close();
  await after(returnDelay * 3);
  expect(focusedId()).toBe("nothing");
  expect(() => returnFocus()).not.toThrow();
  document.body.append(trigger);
  returnFocus();
  expect(focusedId()).toBe("trigger");
});

test("returnFocus focuses the remembered element at once without scrolling, and does nothing once the owner is disposed", async () => {
  const { opened, open, close, trigger, inside } = surface();
  addSpacer();
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
  await after(returnDelay * 3);
  expect(focusedId()).toBe("trigger");
  expect(await axeViolations(document.body)).toEqual([]);
});
