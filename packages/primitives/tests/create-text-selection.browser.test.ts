import { expect, test } from "vite-plus/test";
import { createTextSelection } from "../src/index";
import { mount, record, unmount, watch } from "./support/browser-harness";
import { box, witnessed } from "./support/dom";

test("it reads the document's selection at once, and reports every change to the same Selection object", async () => {
  const text = box("Some text to select");
  const changes = record(document, "selectionchange");
  const { selection, seen } = mount(() => {
    const selection = createTextSelection();
    return { selection, seen: watch(selection) };
  });
  expect(selection()).toBe(document.getSelection());

  document.getSelection()?.selectAllChildren(text);
  await witnessed(() => changes.length > 0, "the selection change");
  await expect.poll(() => seen.length).toBe(1 + changes.length);
  const afterSelecting = changes.length;
  document.getSelection()?.removeAllRanges();
  await witnessed(() => changes.length > afterSelecting, "the second selection change");
  await expect.poll(() => seen.length).toBe(1 + changes.length);
  expect(new Set(seen)).toEqual(new Set([document.getSelection()]));
  expect(selection()?.type).toBe("None");
});

test("once the owner is disposed, a change is no longer reported", async () => {
  const text = box("Some text to select");
  const changes = record(document, "selectionchange");
  const { seen } = mount(() => ({ seen: watch(createTextSelection()) }));

  unmount();
  document.getSelection()?.selectAllChildren(text);
  await witnessed(() => changes.length > 0, "the selection change");
  expect(seen.length).toBe(1);
  document.getSelection()?.removeAllRanges();
});
