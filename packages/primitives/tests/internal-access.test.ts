import { createRoot, createSignal } from "solid-js";
import { expect, test } from "vite-plus/test";
import { access, accessUntracked } from "#/src/internal-access.ts";

test("access gives a value as it is and calls an accessor", () => {
  expect([access(1), access(() => 2)]).toEqual([1, 2]);
});

test("accessUntracked calls an accessor without tracking it", () => {
  createRoot((dispose) => {
    const [value] = createSignal(3);
    expect([accessUntracked(value), accessUntracked(4)]).toEqual([3, 4]);
    dispose();
  });
});
