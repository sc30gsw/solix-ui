import { createEffect, createSignal } from "solid-js";
import { expect, test } from "vite-plus/test";
import { createLeakyListener } from "#/tests/fixtures/leaky-listener.ts";
import { createLeakyObserver } from "#/tests/fixtures/leaky-observer.ts";
import { createLeakySubscription } from "#/tests/fixtures/leaky-subscription.ts";
import { createLeakyTimer } from "#/tests/fixtures/leaky-timer.ts";
import { createCleanupInCommand } from "#/tests/fixtures/raises-diagnostic.ts";
import { flush, mount, reportAfterDispose } from "#/tests/support/browser-harness.ts";
import { attached } from "#/tests/support/dom.ts";

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

test("it reports a listener that a browser value's subscription added and its teardown left", () => {
  mount(() => createLeakySubscription());

  expect(reportAfterDispose()).toEqual(["a change listener on MediaQueryList"]);
});

test("it reports an on<event> handler that an effect set and never cleared", () => {
  const target = attached(document.createElement("div"));
  mount(() =>
    createEffect(
      () => target,
      (element) => {
        Reflect.set(element, "onfocus", () => undefined);
      },
    ),
  );

  expect(reportAfterDispose()).toEqual(["an onfocus handler on HTMLDivElement"]);
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
