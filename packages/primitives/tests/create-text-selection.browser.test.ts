import { expect, test } from "vite-plus/test";
import { userEvent } from "vite-plus/test/browser";
import { createTextSelection } from "#/src/index.ts";
import { mount, record, unmount, watch } from "#/tests/support/browser-harness.ts";
import { box, html, witnessed } from "#/tests/support/dom.ts";

test("it reads the document's selection at once, and reports every change to the same Selection object", async () => {
  const text = box("Some text to select");
  const changes = record(document, "selectionchange");
  const { selection, seen } = mount(() => {
    const selection = createTextSelection();
    return { selection, seen: watch(selection) };
  });
  expect(selection()).toBe(document.getSelection());

  document.getSelection()?.selectAllChildren(text);
  await witnessed(changes, (seen) => seen.length > 0, "the selection change");
  await expect.poll(() => seen.length).toBe(1 + changes.length);
  const afterSelecting = changes.length;
  document.getSelection()?.removeAllRanges();
  await witnessed(changes, (seen) => seen.length > afterSelecting, "the second selection change");
  await expect.poll(() => seen.length).toBe(1 + changes.length);
  expect(new Set(seen)).toEqual(new Set([document.getSelection()]));
  expect(selection()?.type).toBe("None");
});

test("a selection made inside an input is reported, whether the engine aims its selectionchange at the input or at the document", async () => {
  const input = html<HTMLInputElement>(
    `<input value="hello world hello world hello world hello world" />`,
  );
  const sent = record(document, "selectionchange", true);
  const bubbled = record(document, "selectionchange");
  const { seen } = mount(() => ({ seen: watch(createTextSelection()) }));

  await userEvent.dblClick(input);
  await witnessed(sent, (events) => events.length > 0, "the selection of a word in the input");
  await expect.poll(() => seen.length - bubbled.length).toBe(1);
});

test("once the owner is disposed, a change is no longer reported", async () => {
  const text = box("Some text to select");
  const changes = record(document, "selectionchange");
  const { seen } = mount(() => ({ seen: watch(createTextSelection()) }));

  unmount();
  document.getSelection()?.selectAllChildren(text);
  await witnessed(changes, (seen) => seen.length > 0, "the selection change");
  expect(seen.length).toBe(1);
  document.getSelection()?.removeAllRanges();
});
