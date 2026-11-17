import { createSignal } from "solid-js";
import { expect, test, vi } from "vite-plus/test";
import { createClickOutside } from "#/src/index.ts";
import { flush, mount, mountOn, record, unmount } from "#/tests/support/browser-harness.ts";
import { box, pointer, press } from "#/tests/support/dom.ts";

function region(label: string) {
  const inside = box(label);
  const calls: string[] = [];
  mountOn(() => createClickOutside((event) => calls.push(`${label}: ${event.type}`)), inside);
  return { inside, calls };
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

test("a press that the browser cancels, as when a touch starts a scroll, does nothing, and the cancel ends only its own pointer", () => {
  const { calls } = region("menu");
  const outside = box("page");

  pointer("pointerdown", outside, 1);
  pointer("pointercancel", outside, 1);
  pointer("pointerup", outside, 1);
  pointer("pointerdown", outside, 2);
  pointer("pointerdown", outside, 3);
  pointer("pointercancel", outside, 3);
  pointer("pointerup", outside, 2);
  expect(calls).toEqual(["menu: pointerup"]);
});

test("a pointerup of another pointer than the one that pressed does not complete the press", () => {
  const { calls } = region("menu");
  const outside = box("page");

  pointer("pointerdown", outside, 1);
  pointer("pointerup", outside, 2);
  pointer("pointerup", outside, 1);
  expect(calls).toEqual(["menu: pointerup"]);
});

test("where a press starts is read before the page's handlers, so a pointerup an outside widget hid leaves nothing behind for a later press that a widget inside stops", async () => {
  const { inside, calls } = region("menu");
  const handle = box("drag handle", inside);
  handle.addEventListener("pointerdown", (event) => event.stopPropagation());
  const stopper = box("stops its pointerup");
  stopper.addEventListener("pointerup", (event) => event.stopPropagation());
  const elsewhere = box("page");

  await press(stopper);
  await press(handle, elsewhere);
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
  mountOn(() => createClickOutside(() => calls.push("outside")), host);

  await press(button);
  expect(calls).toEqual([]);
});

test("a region inside a closed shadow root tells a press that starts in it by its own listener", () => {
  const host = box("host");
  const shadow = host.attachShadow({ mode: "closed" });
  const inside = box("region in a closed root", shadow);
  const field = document.createElement("input");
  field.setAttribute("aria-label", "Field");
  shadow.append(field);
  const calls: string[] = [];
  mountOn(() => createClickOutside(() => calls.push("outside")), inside);
  const outside = box("page");

  for (const target of [inside, field, outside]) {
    pointer("pointerdown", target);
    pointer("pointerup", target);
  }
  expect(calls).toEqual(["outside", "outside"]);
});

test("with nodes, inside is every node in the list, the list is live, and a missing node makes every press count as inside", async () => {
  const first = box("first");
  const second = box("second");
  const outside = box("page");
  const [nodes, setNodes] = createSignal<readonly (Element | undefined)[]>([first]);
  const calls: string[] = [];
  mount(() => createClickOutside(() => calls.push("outside"), null, nodes));

  await press(second);
  setNodes([first, second]);
  flush();
  await press(first);
  await press(second);
  await press(outside);
  setNodes([first, undefined]);
  flush();
  await press(outside);
  expect(calls).toEqual(["outside", "outside"]);
});

test("enabled is live: turning it off removes the listeners, and turning it on adds them again", async () => {
  const inside = box("menu");
  const outside = box("page");
  const [enabled, setEnabled] = createSignal(false);
  const calls: string[] = [];
  mountOn(() => createClickOutside(() => calls.push("outside"), null, null, enabled), inside);

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
  mountOn(
    () =>
      createClickOutside(
        () => calls.push(capture() ? "capture" : "bubble"),
        null,
        null,
        true,
        capture,
      ),
    box("menu"),
  );

  await press(stopper);
  setCapture(false);
  flush();
  await press(stopper);
  expect(calls).toEqual(["capture"]);
});

test("a list of events tests each listed event on its own, whatever its default, and the handler gets that event", async () => {
  const inside = box("menu");
  const outside = box("page");
  const calls: string[] = [];
  mountOn(
    () =>
      createClickOutside(
        (event) => calls.push(`${event.type} at ${event.clientX > 0 ? "a point" : "no point"}`),
        ["mousedown"],
      ),
    inside,
  );

  outside.addEventListener("mousedown", (event) => event.preventDefault());
  await press(outside, inside);
  await press(inside, outside);
  expect(calls).toEqual(["mousedown at a point"]);
});

test("an events list read again with the same names keeps the listeners in place", () => {
  const [tick, setTick] = createSignal(0);
  mountOn(
    () =>
      createClickOutside(
        () => undefined,
        () => (tick() >= 0 ? ["mousedown"] : []),
      ),
    box("menu"),
  );
  const added = vi.spyOn(EventTarget.prototype, "addEventListener");

  try {
    setTick(1);
    flush();
    setTick(2);
    flush();
    expect(added).not.toHaveBeenCalled();
  } finally {
    added.mockRestore();
  }
});

test("a region decides on its own: a press outside counts whatever its default, and the handler leaves the default alone", async () => {
  const { calls } = region("menu");
  const preventing = box("prevents its pointerup");
  const plain = box("page");
  preventing.addEventListener("pointerup", (event) => event.preventDefault());
  const pointerups = record(window, "pointerup");

  await press(preventing);
  await press(plain);
  expect(calls).toEqual(["menu: pointerup", "menu: pointerup"]);
  expect(pointerups.map((event) => event.defaultPrevented)).toEqual([true, false]);
});

test("of two nested regions, a press outside both calls both handlers, and a press inside the outer and outside the inner calls only the inner, in either order of attaching", async () => {
  const seen: string[][][] = [];
  for (const innerFirst of [false, true]) {
    document.body.replaceChildren();
    const outer = box("outer");
    const outerOnly = box("in the outer only", outer);
    const inner = box("inner", outer);
    const elsewhere = box("page");
    const calls: string[] = [];
    const attach = (name: string, element: HTMLElement) =>
      mountOn(() => createClickOutside(() => calls.push(name)), element);
    if (innerFirst) attach("inner", inner);
    attach("outer", outer);
    if (!innerFirst) attach("inner", inner);

    await press(inner);
    await press(outerOnly);
    const insideTheOuter = [...calls];
    calls.length = 0;
    await press(elsewhere);
    seen.push([insideTheOuter, [...calls].sort()]);
    unmount();
  }
  expect(seen).toEqual([
    [["inner"], ["inner", "outer"]],
    [["inner"], ["inner", "outer"]],
  ]);
});

test("a press inside a child layer portaled outside its parent's node calls only the parent's handler, until the parent passes the layer's node through nodes", async () => {
  const parent = box("parent");
  const elsewhere = box("page");
  const layer = box("portaled layer");
  const calls: string[] = [];
  mountOn(() => createClickOutside(() => calls.push("parent")), parent);
  mountOn(() => createClickOutside(() => calls.push("layer")), layer);

  await press(layer);
  expect(calls).toEqual(["parent"]);
  unmount();
  calls.length = 0;
  mount(() =>
    createClickOutside(
      () => calls.push("parent"),
      null,
      () => [parent, layer],
    ),
  );
  mountOn(() => createClickOutside(() => calls.push("layer")), layer);

  await press(layer);
  await press(parent);
  const insideEither = [...calls];
  calls.length = 0;
  await press(elsewhere);
  expect([insideEither, [...calls].sort()]).toEqual([["layer"], ["layer", "parent"]]);
});
