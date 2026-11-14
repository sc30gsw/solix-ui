import { expect, test } from "vite-plus/test";
import { createPageLeave } from "../src/index";
import { mount, unmount } from "./support/browser-harness";
import { box } from "./support/dom";

function leave(target: Element): void {
  target.dispatchEvent(new MouseEvent("mouseleave", { relatedTarget: null }));
}

test("it calls back when the pointer leaves the document element, and not when it leaves an element inside", () => {
  const seen: string[] = [];
  mount(() => createPageLeave(() => seen.push("left")));

  leave(box("inside"));
  leave(document.documentElement);
  expect(seen).toEqual(["left"]);
});

test("once the owner is disposed it calls nothing", () => {
  const seen: string[] = [];
  mount(() => createPageLeave(() => seen.push("left")));

  unmount();
  leave(document.documentElement);
  expect(seen).toEqual([]);
});
