import { createSignal } from "solid-js";
import { expect, test, vi } from "vite-plus/test";
import { createIntersection } from "#/src/index.ts";
import { flush, mount } from "#/tests/support/browser-harness.ts";
import { box, engineWait } from "#/tests/support/dom.ts";

function scroller(): { root: HTMLDivElement; below: HTMLDivElement } {
  const root = box("root");
  Object.assign(root.style, {
    position: "relative",
    height: "100px",
    overflow: "auto",
    padding: "0",
  });
  const below = box("below", root);
  Object.assign(below.style, { position: "absolute", top: "150px", height: "20px", width: "20px" });
  return { root, below };
}

test("the entry is null until the observer first reports, then the last entry for the element", async () => {
  const { ref, entry } = mount(() => createIntersection<HTMLElement>());
  const element = box("watched");
  expect(entry()).toBe(null);

  ref(element);
  flush();
  await expect.poll(() => entry()?.target, engineWait).toBe(element);
  expect(entry()?.isIntersecting).toBe(true);
  element.hidden = true;
  await expect.poll(() => entry()?.isIntersecting, engineWait).toBe(false);
});

test("root and rootMargin are followed", async () => {
  const { root, below } = scroller();
  const [margin, setMargin] = createSignal("0px");
  const { ref, entry } = mount(() =>
    createIntersection<HTMLElement>(() => ({ root, rootMargin: `0px 0px ${margin()} 0px` })),
  );

  ref(below);
  flush();
  await expect.poll(() => entry()?.isIntersecting, engineWait).toBe(false);
  setMargin("100px");
  flush();
  await expect.poll(() => entry()?.isIntersecting, engineWait).toBe(true);
});

test("options equal by value keep the observer, and a change of threshold builds a new one", () => {
  const [threshold, setThreshold] = createSignal(0);
  const { ref } = mount(() =>
    createIntersection<HTMLElement>(() => ({ threshold: [0, threshold() >= 1 ? 1 : 0.5] })),
  );
  ref(box("watched"));
  flush();
  const observe = vi.spyOn(IntersectionObserver.prototype, "observe");
  const disconnect = vi.spyOn(IntersectionObserver.prototype, "disconnect");

  setThreshold(0.5);
  flush();
  const afterEqual = [observe.mock.calls.length, disconnect.mock.calls.length];
  setThreshold(1);
  flush();
  expect([afterEqual, [observe.mock.calls.length, disconnect.mock.calls.length]]).toEqual([
    [0, 0],
    [1, 1],
  ]);
});
