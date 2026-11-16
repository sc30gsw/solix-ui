import { expect, test } from "vite-plus/test";
import { createFocusWithin, type FocusWithinOptions } from "../src/index";
import { flush, mount, record } from "./support/browser-harness";
import { attached, box, button, nextTask, reported, tab, witnessed } from "./support/dom";
import { replaced } from "./support/replace";

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
      onBlur: (event) => calls.push(`blur ${event?.type ?? "without an event"}`),
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

test("a Tab from one element inside to the next calls nothing", async () => {
  const { element, first, second } = region();
  const { within, calls } = withCalls();
  within.ref(element);
  flush();
  first.focus();
  await nextTask();
  const arrived = record(second, "focusin");

  await tab();
  await witnessed(arrived, (seen) => seen.length > 0, "focus arriving on the second element");
  await nextTask();
  expect({ calls, focused: within.focused() }).toEqual({
    calls: ["focus focusin"],
    focused: true,
  });
});

test("a focusout that names an element inside as the next one calls nothing, in an engine where nothing is focused in the microtask after it", async () => {
  const { element, first, second } = region();
  const { within, calls } = withCalls();
  within.ref(element);
  flush();
  first.focus();
  await nextTask();

  const restore = replaced(element, "matches", () => false);
  try {
    first.dispatchEvent(
      new FocusEvent("focusout", { bubbles: true, composed: true, relatedTarget: second }),
    );
    await nextTask();
  } finally {
    restore();
  }
  expect({ calls, focused: within.focused() }).toEqual({
    calls: ["focus focusin"],
    focused: true,
  });
});

test("focus leaving to an element outside calls onBlur before the code that moved it returns", () => {
  const { element, first } = region();
  const outside = button("outside");
  const { within, calls } = withCalls();
  within.ref(element);
  flush();

  first.focus();
  outside.focus();
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

function silencingFocusout<T>(run: () => T): T {
  const silence = (event: Event) => event.stopImmediatePropagation();
  window.addEventListener("focusout", silence, true);
  try {
    return run();
  } finally {
    window.removeEventListener("focusout", silence, true);
  }
}

const removals = [
  { engine: "an engine that sends a focusout for the removal", remove: (run: () => void) => run() },
  { engine: "an engine that sends none", remove: silencingFocusout },
];

test.each(removals)(
  "removing the focused element from inside makes it false and calls onBlur once, in $engine",
  async ({ remove }) => {
    const { element, first } = region();
    const { within, calls } = withCalls();
    within.ref(element);
    flush();
    first.focus();
    await nextTask();
    calls.length = 0;

    remove(() => first.remove());
    await reported(() => !within.focused(), "focus leaving the removed element");
    await nextTask();
    expect(calls.map((call) => call.split(" ")[0])).toEqual(["blur"]);
  },
);

test.each(removals)(
  "removing the element its ref is on while focus is inside makes it false and calls onBlur once, in $engine",
  async ({ remove }) => {
    const { element, first } = region();
    const { within, calls } = withCalls();
    within.ref(element);
    flush();
    first.focus();
    await nextTask();
    calls.length = 0;

    remove(() => element.remove());
    await reported(() => !within.focused(), "focus leaving the removed region");
    await nextTask();
    expect(calls.map((call) => call.split(" ")[0])).toEqual(["blur"]);
  },
);

test.each(removals)(
  "removing the focused element and focusing another inside before the code returns calls nothing, in $engine",
  async ({ remove }) => {
    const { element, first, second } = region();
    const { within, calls } = withCalls();
    within.ref(element);
    flush();
    first.focus();
    await nextTask();
    calls.length = 0;

    remove(() => first.remove());
    second.focus();
    await nextTask();
    await nextTask();
    expect({ calls, focused: within.focused() }).toEqual({ calls: [], focused: true });
  },
);

test("in a shadow root, removing the focused element makes it false and calls onBlur once, in an engine that sends no focusout for the removal", async () => {
  const root = box("host").attachShadow({ mode: "open" });
  const element = attached(document.createElement("div"), root);
  const inner = button("inner", element);
  const { within, calls } = withCalls();
  within.ref(element);
  flush();
  inner.focus();
  await nextTask();
  calls.length = 0;

  silencingFocusout(() => inner.remove());
  await reported(() => !within.focused(), "focus leaving the removed element");
  expect(calls).toEqual(["blur without an event"]);
});

test("onBlur gets the browser's focusout where it sent one, and no event where the element lost focus without one", async () => {
  const { element, first } = region();
  const outside = button("outside");
  const { within, calls } = withCalls();
  within.ref(element);
  flush();

  first.focus();
  outside.focus();
  await nextTask();
  first.focus();
  await nextTask();
  silencingFocusout(() => first.remove());
  await reported(() => !within.focused(), "focus leaving the removed element");
  expect(calls).toEqual([
    "focus focusin",
    "blur focusout",
    "focus focusin",
    "blur without an event",
  ]);
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
