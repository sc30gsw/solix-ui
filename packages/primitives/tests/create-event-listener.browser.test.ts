import { createSignal } from "solid-js";
import { expect, test } from "vite-plus/test";
import { userEvent } from "vite-plus/test/browser";
import { createEventListener, type ListenerOptions } from "../src/index";
import { attached, flush, mount, unmount } from "./support/browser-harness";

const ping = "solix-ping";

function button(label: string): HTMLButtonElement {
  const element = document.createElement("button");
  element.textContent = label;
  return attached(element);
}

function fire(target: EventTarget): Event {
  const event = new Event(ping, { bubbles: true, cancelable: true });
  target.dispatchEvent(event);
  return event;
}

test("it adds nothing until the ref receives an element, then listens on that element", async () => {
  const seen: string[] = [];
  const target = button("Save");
  const ref = mount(() => createEventListener("click", (event) => seen.push(event.type)));

  await userEvent.click(target);
  ref(target);
  flush();
  await userEvent.click(target);
  expect(seen).toEqual(["click"]);
});

test("the listener moves to each element the ref receives, and is removed when the owner is disposed", async () => {
  const seen: string[] = [];
  const first = button("First");
  const second = button("Second");
  const ref = mount(() =>
    createEventListener("click", (event) =>
      seen.push((event.currentTarget as HTMLElement).textContent ?? ""),
    ),
  );

  ref(first);
  flush();
  await userEvent.click(first);
  ref(second);
  flush();
  await userEvent.click(first);
  await userEvent.click(second);
  unmount();
  await userEvent.click(second);
  expect(seen).toEqual(["First", "Second"]);
});

test("a change of the type moves the listener", () => {
  const seen: string[] = [];
  const target = button("Target");
  const [type, setType] = createSignal(ping);
  const ref = mount(() => createEventListener(type, (event) => seen.push(event.type)));

  ref(target);
  flush();
  fire(target);
  setType("solix-pong");
  flush();
  fire(target);
  target.dispatchEvent(new Event("solix-pong"));
  expect(seen).toEqual([ping, "solix-pong"]);
});

test("a change from capture to bubble removes the listener with the options it was added with", () => {
  const seen: string[] = [];
  const parent = attached(document.createElement("div"));
  const child = document.createElement("span");
  parent.append(child);
  child.addEventListener(ping, (event) => event.stopPropagation());
  const [options, setOptions] = createSignal<ListenerOptions>(true);
  const ref = mount(() => createEventListener(ping, () => seen.push("parent"), options));

  ref(parent);
  flush();
  fire(child);
  setOptions({ capture: false });
  flush();
  fire(child);
  fire(parent);
  expect(seen).toEqual(["parent", "parent"]);
});

test("options compared by value keep the listener in place, with no gap and no duplicate", () => {
  const seen: string[] = [];
  const target = button("Target");
  const [tick, setTick] = createSignal(0);
  const ref = mount(() =>
    createEventListener(
      ping,
      () => seen.push("ran"),
      () => ({ once: tick() >= 0, passive: true }),
    ),
  );

  ref(target);
  flush();
  setTick(1);
  flush();
  fire(target);
  setTick(2);
  flush();
  fire(target);
  expect(seen).toEqual(["ran"]);
});

test("the same element given again changes nothing", () => {
  const seen: string[] = [];
  const target = button("Target");
  const ref = mount(() => createEventListener(ping, () => seen.push("ran"), { once: true }));

  ref(target);
  flush();
  fire(target);
  ref(target);
  flush();
  fire(target);
  expect(seen).toEqual(["ran"]);
});

test("after its owner is disposed, the ref records nothing and adds no listener", () => {
  const seen: string[] = [];
  const target = button("Target");
  const ref = mount(() => createEventListener(ping, () => seen.push("ran")));

  unmount();
  ref(target);
  flush();
  fire(target);
  expect(seen).toEqual([]);
});
