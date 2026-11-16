import { createSignal } from "solid-js";
import { expect, test } from "vite-plus/test";
import { createActiveElement } from "../src/index";
import { flush, mount, record, unmount, watch } from "./support/browser-harness";
import { box, button, engineWait, nextTask, tab, witnessed } from "./support/dom";
import { replaced, withoutGlobal } from "./support/replace";

function shadowHost(): { host: HTMLDivElement; inner: HTMLButtonElement } {
  const host = box("host");
  const root = host.attachShadow({ mode: "open" });
  const inner = document.createElement("button");
  inner.textContent = "inner";
  root.append(inner);
  return { host, inner };
}

test("it reads the focused element at once, the body when nothing has focus, and follows focus as it moves", async () => {
  const first = button("first");
  const second = button("second");
  const active = mount(() => createActiveElement());
  expect(active()).toBe(document.body);

  first.focus();
  await expect.poll(active, engineWait).toBe(first);
  second.focus();
  await expect.poll(active, engineWait).toBe(second);
  second.blur();
  await expect.poll(active, engineWait).toBe(document.body);
});

test("one Tab reports the element that took focus, and not the body between the two", async () => {
  const first = button("first");
  const second = button("second");
  first.focus();
  const { seen } = mount(() => ({ seen: watch(createActiveElement()) }));
  const arrived = record(second, "focusin");

  await tab();
  await witnessed(arrived, (events) => events.length > 0, "focus arriving on the second element");
  await nextTask();
  flush();
  expect(seen).toEqual([first, second]);
});

test("a blur with no element taking focus reads it again, even when the focusout is stopped", async () => {
  const first = button("first");
  first.addEventListener("focusout", (event) => event.stopPropagation());
  const active = mount(() => createActiveElement());
  first.focus();
  await expect.poll(active, engineWait).toBe(first);

  first.blur();
  await expect.poll(active, engineWait).toBe(document.body);
});

test("deep follows focus into an open shadow root, and without it the host is the focused element", async () => {
  const { host, inner } = shadowHost();
  const deep = mount(() => createActiveElement());
  const shallow = mount(() => createActiveElement({ deep: false }));

  inner.focus();
  await expect.poll(deep, engineWait).toBe(inner);
  expect(shallow()).toBe(host);
});

function shadowButtons(parent?: ParentNode): {
  root: ShadowRoot;
  one: HTMLButtonElement;
  two: HTMLButtonElement;
} {
  const root = box("host", parent).attachShadow({ mode: "open" });
  return { root, one: button("one", root), two: button("two", root) };
}

test("deep follows a move between two elements of one shadow root, which the document hears nothing of", async () => {
  const { one, two } = shadowButtons();
  const active = mount(() => createActiveElement());
  const heardByTheDocument = record(document, "focusin", true);

  one.focus();
  await expect.poll(active, engineWait).toBe(one);
  heardByTheDocument.length = 0;
  two.focus();
  await expect.poll(active, engineWait).toBe(two);
  expect(heardByTheDocument).toEqual([]);
});

test("one Tab inside a shadow root reports the element that took focus, and not the host or the body between the two", async () => {
  const { one, two } = shadowButtons();
  one.focus();
  const { seen } = mount(() => ({ seen: watch(createActiveElement()) }));
  const arrived = record(two, "focusin");

  await tab();
  await witnessed(arrived, (events) => events.length > 0, "focus arriving on the second element");
  await nextTask();
  flush();
  expect(seen).toEqual([one, two]);
});

test("deep follows a move inside a shadow root nested in another, and a move out of it into the outer one", async () => {
  const outer = shadowButtons();
  const inner = shadowButtons(outer.root);
  const active = mount(() => createActiveElement());

  inner.one.focus();
  await expect.poll(active, engineWait).toBe(inner.one);
  inner.two.focus();
  await expect.poll(active, engineWait).toBe(inner.two);
  outer.one.focus();
  await expect.poll(active, engineWait).toBe(outer.one);
});

test("once the owner is disposed, a move inside a shadow root it was following is no longer followed", async () => {
  const { one, two } = shadowButtons();
  const active = mount(() => createActiveElement());
  one.focus();
  await expect.poll(active, engineWait).toBe(one);
  const focused = record(two, "focusin");

  unmount();
  two.focus();
  await witnessed(focused, (seen) => seen.length > 0, "the focusin");
  expect(active()).toBe(one);
});

test("a change of deep reads the element again", async () => {
  const { host, inner } = shadowHost();
  const [deep, setDeep] = createSignal(true);
  const active = mount(() => createActiveElement({ deep }));

  inner.focus();
  await expect.poll(active, engineWait).toBe(inner);
  setDeep(false);
  flush();
  expect(active()).toBe(host);
});

test("a widget that stops focusin and focusout from propagating hides nothing from it", async () => {
  const widget = box("widget");
  const inner = button("inner", widget);
  for (const type of ["focusin", "focusout"]) {
    widget.addEventListener(type, (event) => event.stopPropagation());
  }
  const active = mount(() => createActiveElement());

  inner.focus();
  await expect.poll(active, engineWait).toBe(inner);
});

test("where the document leaves activeElement out, it reads null", () => {
  const restore = replaced(document, "activeElement", undefined);
  try {
    const active = mount(() => createActiveElement());

    expect(active()).toBe(null);
  } finally {
    restore();
  }
});

test("a focused element that is removed is not kept, in the page or in a shadow root on the way to it", async () => {
  const first = button("first");
  const { inner } = shadowHost();
  const active = mount(() => createActiveElement());

  first.focus();
  await expect.poll(active, engineWait).toBe(first);
  first.remove();
  await expect.poll(active, engineWait).toBe(document.body);
  inner.focus();
  await expect.poll(active, engineWait).toBe(inner);
  inner.remove();
  await expect.poll(active, engineWait).toBe(document.body);
});

test("without MutationObserver it still follows focus, and nothing throws", async () => {
  const first = button("first");
  const active = withoutGlobal("MutationObserver", () => mount(() => createActiveElement()));

  first.focus();
  await expect.poll(active, engineWait).toBe(first);
});

test("once the owner is disposed, focus is no longer followed", async () => {
  const first = button("first");
  const active = mount(() => createActiveElement());

  const focused = record(first, "focusin");

  unmount();
  first.focus();
  await witnessed(focused, (seen) => seen.length > 0, "the focusin");
  expect(active()).toBe(document.body);
});
