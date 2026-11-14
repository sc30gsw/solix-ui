import { createSignal } from "solid-js";
import { expect, test } from "vite-plus/test";
import { userEvent } from "vite-plus/test/browser";
import { createClickOutside } from "../src/index";
import { flush, mount, unmount } from "./support/browser-harness";

function box(label: string, parent: HTMLElement = document.body): HTMLDivElement {
  const element = document.createElement("div");
  element.textContent = label;
  element.style.padding = "8px";
  parent.append(element);
  return element;
}

function region(label: string) {
  const inside = box(label);
  const ref = mount(() => createClickOutside((event) => calls.push(`${label}: ${event.type}`)));
  const calls: string[] = [];
  ref(inside);
  flush();
  return { inside, calls };
}

function press(down: Element, up: Element = down): Promise<void> {
  return userEvent.pointer([
    { target: down, keys: "[MouseLeft>]" },
    { target: up, keys: "[/MouseLeft]" },
  ]);
}

function pointer(type: string, target: EventTarget, pointerId = 1): PointerEvent {
  const event = new PointerEvent(type, {
    bubbles: true,
    cancelable: true,
    composed: true,
    pointerId,
  });
  target.dispatchEvent(event);
  return event;
}

test("a press outside calls the handler with the pointerup, and a press inside does not", async () => {
  const { inside, calls } = region("menu");
  const outside = box("page");

  await press(inside);
  await press(outside);
  expect(calls).toEqual(["menu: pointerup"]);
});

test("a press that starts inside and ends outside, or starts outside and ends inside, does nothing", async () => {
  const { inside, calls } = region("menu");
  const outside = box("page");

  await press(inside, outside);
  await press(outside, inside);
  expect(calls).toEqual([]);
});

test("a press that the browser cancels, as when a touch starts a scroll, does nothing", () => {
  const { calls } = region("menu");
  const outside = box("page");

  pointer("pointerdown", outside);
  pointer("pointercancel", outside);
  pointer("pointerup", outside);
  expect(calls).toEqual([]);
});

test("a pointerup of another pointer than the one that pressed does not complete the press", () => {
  const { calls } = region("menu");
  const outside = box("page");

  pointer("pointerdown", outside, 1);
  pointer("pointerup", outside, 2);
  pointer("pointerup", outside, 1);
  expect(calls).toEqual([]);
});

test("a press whose target a handler on its path removed from the page is never outside", () => {
  const { calls } = region("menu");
  const removedOnDown = box("removed when pressed");
  removedOnDown.addEventListener("pointerdown", () => removedOnDown.remove());
  const removedOnUp = box("removed when released");
  removedOnUp.addEventListener("pointerup", () => removedOnUp.remove());
  const stays = box("page");

  pointer("pointerdown", removedOnDown);
  pointer("pointerup", stays);
  pointer("pointerdown", removedOnUp);
  pointer("pointerup", removedOnUp);
  expect(calls).toEqual([]);
});

test("content in an open shadow root counts as inside its host", async () => {
  const host = box("host");
  const shadow = host.attachShadow({ mode: "open" });
  const button = document.createElement("button");
  button.textContent = "In the shadow";
  shadow.append(button);
  const calls: string[] = [];
  const ref = mount(() => createClickOutside(() => calls.push("outside")));
  ref(host);
  flush();

  await press(button);
  expect(calls).toEqual([]);
});

test("before the ref receives an element, every press counts as inside", async () => {
  const calls: string[] = [];
  mount(() => createClickOutside(() => calls.push("outside")));

  await press(box("page"));
  expect(calls).toEqual([]);
});

test("with nodes, it returns no ref, inside is every node, and a missing node makes every press count as inside", async () => {
  const first = box("first");
  const second = box("second");
  const outside = box("page");
  const [nodes, setNodes] = createSignal<readonly (Element | undefined)[]>([first, second]);
  const calls: string[] = [];
  const returned = mount(() => createClickOutside(() => calls.push("outside"), null, nodes));

  await press(first);
  await press(second);
  await press(outside);
  setNodes([first, undefined]);
  await press(outside);
  expect(returned).toBeUndefined();
  expect(calls).toEqual(["outside"]);
});

test("enabled is live: turning it off removes the listeners, and turning it on adds them again", async () => {
  const inside = box("menu");
  const outside = box("page");
  const [enabled, setEnabled] = createSignal(false);
  const calls: string[] = [];
  const ref = mount(() => createClickOutside(() => calls.push("outside"), null, null, enabled));
  ref(inside);
  flush();

  await press(outside);
  setEnabled(true);
  flush();
  await press(outside);
  setEnabled(false);
  flush();
  await press(outside);
  expect(calls).toEqual(["outside"]);
});

test("with capture, an outside element that stops the press in its own handler does not hide it; without capture, it does", async () => {
  const stopper = box("stops propagation");
  stopper.addEventListener("pointerup", (event) => event.stopPropagation());
  const [capture, setCapture] = createSignal(true);
  const calls: string[] = [];
  const ref = mount(() =>
    createClickOutside(
      () => calls.push(capture() ? "capture" : "bubble"),
      null,
      null,
      true,
      capture,
    ),
  );
  ref(box("menu"));
  flush();

  await press(stopper);
  setCapture(false);
  flush();
  await press(stopper);
  expect(calls).toEqual(["capture"]);
});

test("a list of events tests each listed event on its own, whatever its default, the way the mirrored default does", async () => {
  const inside = box("menu");
  const outside = box("page");
  const calls: string[] = [];
  const ref = mount(() =>
    createClickOutside((event) => calls.push(event.type), ["mousedown", "touchstart"]),
  );
  ref(inside);
  flush();

  outside.addEventListener("mousedown", (event) => event.preventDefault());
  await press(outside, inside);
  await press(inside, outside);
  expect(calls).toEqual(["mousedown"]);
});

test("an events array read again with the same names keeps the listeners in place", async () => {
  const added: string[] = [];
  const add = EventTarget.prototype.addEventListener.bind(document);
  const [tick, setTick] = createSignal(0);
  const ref = mount(() =>
    createClickOutside(
      () => undefined,
      () => (tick() >= 0 ? ["mousedown"] : []),
    ),
  );
  document.addEventListener = (...args: Parameters<typeof add>) => {
    added.push(args[0]);
    add(...args);
  };
  try {
    ref(box("menu"));
    flush();
    setTick(1);
    flush();
    setTick(2);
    flush();
  } finally {
    Reflect.deleteProperty(document, "addEventListener");
  }
  expect(added).toEqual(["mousedown"]);
});

test("a press whose default a handler on its path already prevented is ignored, and a handled press has its default prevented", async () => {
  const { calls } = region("menu");
  const preventing = box("prevents its pointerup");
  const plain = box("page");
  preventing.addEventListener("pointerup", (event) => event.preventDefault());
  const defaults: boolean[] = [];
  window.addEventListener("pointerup", (event) => defaults.push(event.defaultPrevented), {
    once: true,
  });

  await press(preventing);
  await press(plain);
  expect(calls).toEqual(["menu: pointerup"]);
  expect(defaults).toEqual([true]);
  const handled: boolean[] = [];
  window.addEventListener("pointerup", (event) => handled.push(event.defaultPrevented), {
    once: true,
  });
  await press(plain);
  expect(handled).toEqual([true]);
});

test("of two nested regions, a press inside the outer and outside the inner is handled by the inner, and a press outside both by the region attached first only", async () => {
  const outer = box("outer");
  const outerOnly = box("in the outer only", outer);
  const inner = box("inner", outer);
  const elsewhere = box("page");
  const calls: string[] = [];
  const outerRef = mount(() => createClickOutside(() => calls.push("outer")));
  const innerRef = mount(() => createClickOutside(() => calls.push("inner")));
  outerRef(outer);
  flush();
  innerRef(inner);
  flush();

  await press(outerOnly);
  await press(inner);
  await press(elsewhere);
  expect(calls).toEqual(["inner", "outer"]);
});

test("the inner of two nested regions handles a press outside both when it was attached first, and the outer ignores the press whose default it prevented", async () => {
  const outer = box("outer");
  const inner = box("inner", outer);
  const calls: string[] = [];
  const innerRef = mount(() => createClickOutside(() => calls.push("inner")));
  const outerRef = mount(() => createClickOutside(() => calls.push("outer")));
  innerRef(inner);
  flush();
  outerRef(outer);
  flush();

  await press(box("page"));
  expect(calls).toEqual(["inner"]);
});

test("the handler is the function passed, and the listeners are removed when the owner is disposed", async () => {
  const { calls } = region("menu");
  const outside = box("page");

  unmount();
  await press(outside);
  expect(calls).toEqual([]);
});
