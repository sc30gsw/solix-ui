import { expect, test } from "vite-plus/test";
import { createValue } from "#/src/internal-value.ts";
import { flush, mount, unmount } from "#/tests/support/browser-harness.ts";

test("an update decides on the value staged before it, writes only a change, and the read shows the committed value until the flush", () => {
  const value = mount(() => createValue(1));

  const first = value.update((staged) => staged + 1);
  const second = value.update((staged) => staged * 10);
  const same = value.update((staged) => staged);
  const before = value.get();
  flush();
  expect([first, second, same, before, value.get()]).toEqual([
    { changed: true, value: 2 },
    { changed: true, value: 20 },
    { changed: false, value: 20 },
    1,
    20,
  ]);
});

test("its comparison decides what counts as a change, and once the owner is disposed nothing is written", () => {
  const value = mount(() =>
    createValue("a", (left, right) => left.toLowerCase() === right.toLowerCase()),
  );

  const same = value.update(() => "A");
  unmount();
  const late = value.update(() => "b");
  expect([same.changed, late.changed]).toEqual([false, false]);
});
