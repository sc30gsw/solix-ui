import { expect, test } from "vite-plus/test";
import { createInViewport } from "#/src/index.ts";
import { flush, mount } from "#/tests/support/browser-harness.ts";
import { box, engineWait } from "#/tests/support/dom.ts";

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
