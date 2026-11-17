import { createSignal } from "solid-js";
import { expect, test } from "vite-plus/test";
import { createWindowEvent, type ListenerOptions } from "#/src/index.ts";
import { flush, mount, unmount } from "#/tests/support/browser-harness.ts";
import { attached } from "#/tests/support/dom.ts";

const ping = "solix-ping";

function fire(target: EventTarget = window, init: EventInit = {}): Event {
  const event = new Event(ping, { bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(event);
  return event;
}

test("it listens on window once its owner's effects run, and stops when the owner is disposed", () => {
  const seen: string[] = [];
  mount(() => createWindowEvent("resize", (event) => seen.push(event.type)));

  window.dispatchEvent(new Event("resize"));
  unmount();
  window.dispatchEvent(new Event("resize"));
  expect(seen).toEqual(["resize"]);
});

test("a custom event name works, and a change of the type moves the listener", () => {
  const seen: string[] = [];
  const [type, setType] = createSignal(ping);
  mount(() => createWindowEvent(type, (event) => seen.push(event.type)));

  fire();
  setType("solix-pong");
  flush();
  fire();
  window.dispatchEvent(new Event("solix-pong"));
  expect(seen).toEqual([ping, "solix-pong"]);
});

test("capture, as a boolean or in an object, runs the listener before a handler on the target stops the event", () => {
  const seen: string[] = [];
  const target = attached(document.createElement("div"));
  target.addEventListener(ping, (event) => event.stopPropagation());
  mount(() => createWindowEvent(ping, () => seen.push("boolean"), true));
  mount(() => createWindowEvent(ping, () => seen.push("object"), { capture: true }));
  mount(() => createWindowEvent(ping, () => seen.push("bubble")));

  fire(target);
  expect(seen).toEqual(["boolean", "object"]);
});

test("passive is followed: a passive listener cannot prevent the default, and turning it off moves the listener", () => {
  const [options, setOptions] = createSignal<ListenerOptions>({ passive: true });
  mount(() => createWindowEvent(ping, (event) => event.preventDefault(), options));

  expect(fire().defaultPrevented).toBe(false);
  setOptions({ passive: false });
  flush();
  expect(fire().defaultPrevented).toBe(true);
});

test("options compared by value keep the listener in place: a once listener added once runs once, however often its options are read again", () => {
  const seen: string[] = [];
  const [tick, setTick] = createSignal(0);
  mount(() =>
    createWindowEvent(
      ping,
      () => seen.push("ran"),
      () => ({ once: tick() >= 0 }),
    ),
  );

  fire();
  setTick(1);
  flush();
  setTick(2);
  flush();
  fire();
  expect(seen).toEqual(["ran"]);
});

test("an aborted signal removes the listener, and a new signal adds it again", () => {
  const seen: string[] = [];
  const [controller, setController] = createSignal(new AbortController());
  mount(() =>
    createWindowEvent(
      ping,
      () => seen.push("ran"),
      () => ({ signal: controller().signal }),
    ),
  );

  controller().abort();
  fire();
  setController(new AbortController());
  flush();
  fire();
  expect(seen).toEqual(["ran"]);
});

test("the listener is the function passed, so it reads the latest state when it runs", () => {
  const seen: number[] = [];
  const [count, setCount] = createSignal(1);
  mount(() => createWindowEvent(ping, () => seen.push(count())));

  fire();
  setCount(2);
  flush();
  fire();
  expect(seen).toEqual([1, 2]);
});
