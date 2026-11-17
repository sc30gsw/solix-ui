import { createSignal } from "solid-js";
import { expect, test } from "vite-plus/test";
import { userEvent } from "vite-plus/test/browser";
import { createEventListener, type ListenerOptions } from "#/src/index.ts";
import { flush, mountOn } from "#/tests/support/browser-harness.ts";
import { attached, button } from "#/tests/support/dom.ts";

const ping = "solix-ping";

function fire(target: EventTarget, type = ping): void {
  target.dispatchEvent(new Event(type, { bubbles: true, cancelable: true }));
}

test("it listens on the element its ref received, with the event its map gives", async () => {
  const seen: string[] = [];
  const target = button("Save");
  mountOn(
    () => createEventListener("click", (event) => seen.push(`${event.type} ${event.button}`)),
    target,
  );

  await userEvent.click(target);
  expect(seen).toEqual(["click 0"]);
});

test("it takes an SVG element, with the SVG event map", async () => {
  const seen: string[] = [];
  const svg = attached(document.createElementNS("http://www.w3.org/2000/svg", "svg"));
  svg.setAttribute("width", "40");
  svg.setAttribute("height", "40");
  mountOn(
    () =>
      createEventListener<"pointerdown", SVGSVGElement>("pointerdown", (event) =>
        seen.push(`${event.type} ${event.pointerType}`),
      ),
    svg,
  );

  await userEvent.click(svg);
  expect(seen).toEqual(["pointerdown mouse"]);
});

test("a change of the type moves the listener", () => {
  const seen: string[] = [];
  const target = button("Target");
  const [type, setType] = createSignal(ping);
  mountOn(() => createEventListener(type, (event) => seen.push(event.type)), target);

  fire(target);
  setType("solix-pong");
  flush();
  fire(target, ping);
  fire(target, "solix-pong");
  expect(seen).toEqual([ping, "solix-pong"]);
});

test("a change from capture to bubble removes the listener with the options it was added with", () => {
  const seen: string[] = [];
  const parent = attached(document.createElement("div"));
  const child = attached(document.createElement("span"), parent);
  child.addEventListener(ping, (event) => event.stopPropagation());
  const [options, setOptions] = createSignal<ListenerOptions>(true);
  mountOn(() => createEventListener(ping, () => seen.push("parent"), options), parent);

  fire(child);
  setOptions({ capture: false });
  flush();
  fire(child);
  fire(parent);
  expect(seen).toEqual(["parent", "parent"]);
});
