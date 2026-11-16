import { createSignal } from "solid-js";
import { expect, test, vi } from "vite-plus/test";
import { createResizeObserver } from "../src/index";
import { flush, mount, unmount } from "./support/browser-harness";
import { box, engineWait, settled } from "./support/dom";
import { fakeObserver } from "./support/fake-observer";

const zeros = { x: 0, y: 0, width: 0, height: 0, top: 0, left: 0, bottom: 0, right: 0 };

function sized(width: number, height: number): HTMLDivElement {
  const element = box("sized");
  Object.assign(element.style, {
    boxSizing: "content-box",
    width: `${width}px`,
    height: `${height}px`,
    padding: "10px 20px",
    border: "3px solid",
  });
  return element;
}

function entry(target: Element, width: number): unknown {
  const contentRect = { x: 0, y: 0, width, height: 10, top: 0, left: 0, bottom: 10, right: width };
  return { target, contentRect, contentBoxSize: [{ inlineSize: width, blockSize: 10 }] };
}

test("the box is all zeros until the ref has an element, then it follows the content box, with the position of contentRect", async () => {
  const [ref, rect] = mount(() => createResizeObserver<HTMLElement>());
  expect(rect()).toEqual(zeros);
  const element = sized(120, 40);

  ref(element);
  flush();
  await expect
    .poll(rect, engineWait)
    .toEqual({ x: 20, y: 10, width: 120, height: 40, top: 10, left: 20, bottom: 50, right: 140 });
  element.style.width = "150px";
  await expect.poll(() => rect().width, engineWait).toBe(150);
});

test("with box border-box, width and height measure the border box, and a change of box watches the new box", async () => {
  const [box, setBox] = createSignal<ResizeObserverBoxOptions>("border-box");
  const [ref, rect] = mount(() => createResizeObserver<HTMLElement>(() => ({ box: box() })));
  ref(sized(120, 40));
  flush();

  await expect.poll(() => [rect().width, rect().height], engineWait).toEqual([166, 66]);
  setBox("content-box");
  flush();
  await expect.poll(() => [rect().width, rect().height], engineWait).toEqual([120, 40]);
});

test("in a vertical writing mode, width and height of the border box are still the physical width and height", async () => {
  const [ref, rect] = mount(() => createResizeObserver<HTMLElement>({ box: "border-box" }));
  const element = sized(120, 40);
  element.style.writingMode = "vertical-rl";

  ref(element);
  flush();
  await expect.poll(() => [rect().width, rect().height], engineWait).toEqual([166, 66]);
});

test("a newer report before the next frame replaces the waiting one, so two reports in one frame write the box once", async () => {
  const observer = fakeObserver("ResizeObserver");
  const frames = vi.spyOn(window, "requestAnimationFrame");
  const cancels = vi.spyOn(window, "cancelAnimationFrame");
  try {
    const element = box("observed");
    const [ref, rect] = mount(() => createResizeObserver<HTMLElement>());
    ref(element);
    flush();

    observer.deliver([entry(element, 101)]);
    observer.deliver([entry(element, 102)]);
    const [first, second] = frames.mock.results.map(({ value }) => value);
    const scheduled = frames.mock.calls.length;
    const cancelled = cancels.mock.calls.map(([id]) => id);
    await settled();
    expect(rect().width).toBe(102);
    expect(scheduled).toBe(2);
    expect(cancelled).toContain(first);
    expect(cancelled).not.toContain(second);
  } finally {
    frames.mockRestore();
    cancels.mockRestore();
    observer.restore();
  }
});

test("disposing the owner between a report and its frame cancels the frame", async () => {
  const observer = fakeObserver("ResizeObserver");
  try {
    const element = box("observed");
    const [ref, rect] = mount(() => createResizeObserver<HTMLElement>());
    ref(element);
    flush();

    observer.deliver([entry(element, 180)]);
    unmount();
    await settled();
    expect(rect()).toEqual(zeros);
  } finally {
    observer.restore();
  }
});
