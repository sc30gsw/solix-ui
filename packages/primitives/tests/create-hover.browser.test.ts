import { expect, test } from "vite-plus/test";
import { userEvent } from "vite-plus/test/browser";
import { createHover } from "../src/index";
import { flush, mount } from "./support/browser-harness";
import { box, engineWait } from "./support/dom";

test("it is false until the pointer enters the element, true while it is over it, and false once it leaves", async () => {
  const { ref, hovered } = mount(() => createHover<HTMLElement>());
  const element = box("hovered");
  const away = box("away");
  ref(element);
  flush();
  expect(hovered()).toBe(false);

  await userEvent.hover(element);
  await expect.poll(hovered, engineWait).toBe(true);
  await userEvent.hover(away);
  await expect.poll(hovered, engineWait).toBe(false);
});

test("when the ref moves to another element it goes back to false, and the old element no longer counts", async () => {
  const { ref, hovered } = mount(() => createHover<HTMLElement>());
  const first = box("first");
  const second = box("second");
  const away = box("away");
  ref(first);
  flush();
  await userEvent.hover(first);
  await expect.poll(hovered, engineWait).toBe(true);

  ref(second);
  flush();
  expect(hovered()).toBe(false);
  await userEvent.hover(away);
  await userEvent.hover(first);
  expect(hovered()).toBe(false);
  await userEvent.hover(second);
  await expect.poll(hovered, engineWait).toBe(true);
});

test("a ref put on an element the pointer is already over reads it as hovered", async () => {
  const { ref, hovered } = mount(() => createHover<HTMLElement>());
  const element = box("hovered");

  await userEvent.hover(element);
  ref(element);
  flush();
  expect(hovered()).toBe(true);
});
