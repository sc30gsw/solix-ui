import { expect, test } from "vite-plus/test";
import { createInViewport } from "../src/index";
import { flush, mount } from "./support/browser-harness";
import { box, engineWait } from "./support/dom";

test("it is whether the entry createIntersection reports intersects, false until it does", async () => {
  const { ref, inViewport } = mount(() => createInViewport<HTMLElement>());
  const element = box("watched");
  expect(inViewport()).toBe(false);

  ref(element);
  flush();
  await expect.poll(inViewport, engineWait).toBe(true);
  element.hidden = true;
  await expect.poll(inViewport, engineWait).toBe(false);
});
