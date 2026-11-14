import { expect, test } from "vite-plus/test";
import { createElementSize } from "../src/index";
import { flush, mount } from "./support/browser-harness";
import { box, engineWait } from "./support/dom";

test("width and height are those of the box createResizeObserver reports, 0 until it does", async () => {
  const size = mount(() => createElementSize<HTMLElement>({ box: "border-box" }));
  const element = box("sized");
  Object.assign(element.style, { width: "80px", height: "30px", padding: "5px" });
  expect([size.width(), size.height()]).toEqual([0, 0]);

  size.ref(element);
  flush();
  await expect.poll(() => [size.width(), size.height()], engineWait).toEqual([90, 40]);
});
