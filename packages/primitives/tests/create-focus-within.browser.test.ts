import { expect, test } from "vite-plus/test";
import { createFocusWithin, type FocusWithinOptions } from "../src/index";
import { flush, mount } from "./support/browser-harness";
import { attached, box, button, nextTask, reported } from "./support/dom";

function region(): {
  element: HTMLDivElement;
  first: HTMLButtonElement;
  second: HTMLButtonElement;
  icon: SVGSVGElement;
} {
  const element = box("region");
  const first = button("first", element);
  const second = button("second", element);
  const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  icon.setAttribute("tabindex", "0");
  element.append(icon);
  return { element, first, second, icon };
}

function withCalls(options: FocusWithinOptions = {}) {
  const calls: string[] = [];
  const within = mount(() =>
    createFocusWithin<HTMLElement>({
      onFocus: (event) => calls.push(`focus ${event.type}`),
      onBlur: (event) => calls.push(`blur ${event.type}`),
      ...options,
    }),
  );
  return { within, calls };
}

test("focus entering calls onFocus once, moving inside calls nothing, and leaving calls onBlur once", async () => {
  const { element, first, second, icon } = region();
  const outside = button("outside");
  const { within, calls } = withCalls();
  within.ref(element);
  flush();

  first.focus();
  second.focus();
  icon.focus();
  await nextTask();
  const inside = within.focused();
  outside.focus();
  await nextTask();
  expect([inside, within.focused()]).toEqual([true, false]);
  expect(calls).toEqual(["focus focusin", "blur focusout"]);
});

test("focus leaving to nothing counts as leaving", async () => {
  const { element, first } = region();
  const { within, calls } = withCalls();
  within.ref(element);
  flush();

  first.focus();
  first.blur();
  await nextTask();
  expect(within.focused()).toBe(false);
  expect(calls).toEqual(["focus focusin", "blur focusout"]);
});

test("a ref put on an element that already holds focus reads it, and calls nothing", async () => {
  const { element, first } = region();
  first.focus();
  const { within, calls } = withCalls();

  within.ref(element);
  flush();
  expect(within.focused()).toBe(true);
  expect(calls).toEqual([]);
});

test("each callback is read when it is called, so the latest one runs", async () => {
  const { element, first } = region();
  const seen: string[] = [];
  const options: FocusWithinOptions = { onFocus: () => seen.push("first") };
  const within = mount(() => createFocusWithin<HTMLElement>(options));
  within.ref(element);
  flush();

  options.onFocus = () => seen.push("second");
  first.focus();
  await nextTask();
  expect(seen).toEqual(["second"]);
});

test("removing the focused element from inside makes it false and calls onBlur once, in an engine that sends no focusout too", async () => {
  const { element, first } = region();
  const { within, calls } = withCalls();
  within.ref(element);
  flush();
  first.focus();
  await nextTask();

  first.remove();
  await reported(() => !within.focused(), "focus leaving the removed element");
  await nextTask();
  expect(calls).toEqual(["focus focusin", "blur focusout"]);
});

test("removing the focused element makes it false and calls onBlur once where the engine sends no focusout for the removal", async () => {
  const { element, first } = region();
  const { within, calls } = withCalls();
  within.ref(element);
  flush();
  first.focus();
  await nextTask();
  const silence = (event: Event) => event.stopImmediatePropagation();
  window.addEventListener("focusout", silence, true);
  try {
    first.remove();
    await reported(() => !within.focused(), "focus leaving the removed element");
    await nextTask();
  } finally {
    window.removeEventListener("focusout", silence, true);
  }
  expect(calls).toEqual(["focus focusin", "blur focusout"]);
});

test("a widget inside that stops focusin and focusout from propagating hides nothing from it", async () => {
  const { element, first } = region();
  for (const type of ["focusin", "focusout"]) {
    first.addEventListener(type, (event) => event.stopPropagation());
  }
  const outside = button("outside");
  const { within, calls } = withCalls();
  within.ref(element);
  flush();

  first.focus();
  outside.focus();
  await nextTask();
  expect(calls).toEqual(["focus focusin", "blur focusout"]);
});

test("in a frame's page, focus moving between elements inside counts as inside", async () => {
  const frame = attached(document.createElement("iframe"));
  const page = frame.contentDocument;
  if (!page) throw new Error("the frame has no document");
  page.body.innerHTML = "<div id=region><input id=a><input id=b></div>";
  const region = page.getElementById("region");
  const [a, b] = [page.getElementById("a"), page.getElementById("b")];
  if (!region || !a || !b) throw new Error("the frame's page is not built");
  const { within, calls } = withCalls();
  within.ref(region);
  flush();

  frame.contentWindow?.focus();
  a.focus();
  b.focus();
  await nextTask();
  expect(within.focused()).toBe(true);
  expect(calls).toEqual(["focus focusin"]);
});
