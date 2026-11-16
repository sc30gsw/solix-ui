import { afterEach, expect, test } from "vite-plus/test";
import { createDocumentVisibility } from "../src/index";
import { mount, unmount } from "./support/browser-harness";
import { nextTask } from "./support/dom";
import { replaced } from "./support/replace";

const restores: (() => void)[] = [];

function shownAs(state: DocumentVisibilityState): void {
  restores.push(replaced(document, "visibilityState", state));
  document.dispatchEvent(new Event("visibilitychange"));
}

afterEach(() => {
  for (const restore of restores.splice(0).reverse()) restore();
});

test("it reads the document's visibility at once, and follows it both ways", async () => {
  const visibility = mount(() => createDocumentVisibility());
  const seen = [visibility()];

  shownAs("hidden");
  await nextTask();
  seen.push(visibility());
  shownAs("visible");
  await nextTask();
  seen.push(visibility());
  expect(seen).toEqual(["visible", "hidden", "visible"]);
});

test("once the owner is disposed, a change is no longer followed", async () => {
  const visibility = mount(() => createDocumentVisibility());

  unmount();
  shownAs("hidden");
  await nextTask();
  expect(visibility()).toBe("visible");
});
