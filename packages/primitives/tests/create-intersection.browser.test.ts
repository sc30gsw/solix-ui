import { createSignal } from "solid-js";
import { expect, test, vi } from "vite-plus/test";
import { createIntersection } from "../src/index";
import { flush, mount } from "./support/browser-harness";
import { box, settled, engineWait } from "./support/dom";
import { withoutGlobal } from "./support/replace";

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

test("when the ref moves to another element, the entry goes back to null, then follows the new element", async () => {
  const { ref, entry } = mount(() => createIntersection<HTMLElement>());
  const first = box("first");
  const second = box("second");
  ref(first);
  flush();
  await expect.poll(() => entry()?.target, engineWait).toBe(first);

  ref(second);
  flush();
  expect(entry()).toBe(null);
  await expect.poll(() => entry()?.target, engineWait).toBe(second);
});

test("without IntersectionObserver the entry stays null, and nothing throws", async () => {
  const { ref, entry } = mount(() => createIntersection<HTMLElement>());

  withoutGlobal("IntersectionObserver", () => {
    ref(box("watched"));
    flush();
  });
  await settled();
  expect(entry()).toBe(null);
});
