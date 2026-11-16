import { expect, test } from "vite-plus/test";
import { userEvent } from "vite-plus/test/browser";
import { createHover } from "../src/index";
import { flush, mount, record } from "./support/browser-harness";
import { box, engineWait, witnessed } from "./support/dom";

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

test("the pointer moving from a child onto the element's own area keeps it hovered, since the child's mouseleave is not the element's", async () => {
  const { ref, hovered } = mount(() => createHover<HTMLElement>());
  const element = box("hovered");
  element.style.padding = "60px";
  const child = box("child", element);
  const away = box("away");
  ref(element);
  flush();
  const leaves = record(child, "mouseleave");

  await userEvent.hover(child);
  await expect.poll(hovered, engineWait).toBe(true);
  await userEvent.hover(element, { position: { x: 5, y: 5 } });
  await witnessed(leaves, (seen) => seen.length > 0, "the pointer leaving the child");
  expect([element.matches(":hover"), hovered()]).toEqual([true, true]);
  await userEvent.hover(away);
  await expect.poll(hovered, engineWait).toBe(false);
});
