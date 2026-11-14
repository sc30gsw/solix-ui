import { createEffect, createSignal } from "solid-js";
import { expect, test } from "vite-plus/test";
import { createLeakyListener } from "./fixtures/leaky-listener";
import { createLeakyObserver } from "./fixtures/leaky-observer";
import { createLeakyTimer } from "./fixtures/leaky-timer";
import { createCleanupInCommand } from "./fixtures/raises-diagnostic";
import { attached, flush, mount, reportAfterDispose } from "./support/browser-harness";

test("it reports a listener that an effect added on a later flush and never removed", () => {
  const [target, setTarget] = createSignal<EventTarget | undefined>(undefined);
  mount(() => createLeakyListener(target));

  setTarget(window);
  flush();
  expect(reportAfterDispose()).toEqual(["a resize listener on Window"]);
});

test("it reports a timer that a returned command started and never cleared", () => {
  const start = mount(() => createLeakyTimer());

  start();
  expect(reportAfterDispose()).toEqual(["a pending interval"]);
});

test("it reports an observation that an effect started and never disconnected", () => {
  const target = attached(document.createElement("div"));
  mount(() => createLeakyObserver(target));

  expect(reportAfterDispose()).toEqual(["an observation by a ResizeObserver"]);
});

test("it reports a Solid development diagnostic", () => {
  const command = mount(() => createCleanupInCommand());

  command();
  expect(reportAfterDispose()).toEqual([expect.stringMatching(/^NO_OWNER_CLEANUP: /)]);
});

test("it reports nothing for a listener removed on dispose, or for one the test adds itself", () => {
  const onResize = () => undefined;
  mount(() =>
    createEffect(
      () => window,
      (target) => {
        target.addEventListener("resize", onResize);
        return () => target.removeEventListener("resize", onResize);
      },
    ),
  );
  window.addEventListener("resize", onResize);

  expect(reportAfterDispose()).toEqual([]);
  window.removeEventListener("resize", onResize);
});
