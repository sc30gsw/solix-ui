import { createSignal } from "solid-js";
import { expect, test } from "vite-plus/test";
import { createMutationObserver } from "../src/index";
import { flush, mount } from "./support/browser-harness";
import { box, nextTask } from "./support/dom";
import { withoutGlobal } from "./support/replace";

function recorder() {
  const seen: string[] = [];
  const callback: MutationCallback = (records) => {
    for (const record of records) {
      seen.push(record.type === "attributes" ? `attribute ${record.attributeName}` : record.type);
    }
  };
  return { seen, callback };
}

test("it calls back with the mutations of the element that the options ask for, once the ref has an element", async () => {
  const { seen, callback } = recorder();
  const ref = mount(() =>
    createMutationObserver(callback, { childList: true, attributeFilter: ["data-state"] }),
  );
  const element = box("watched");
  element.append(document.createElement("span"));
  await nextTask();

  ref(element);
  flush();
  element.append(document.createElement("span"));
  element.setAttribute("data-state", "open");
  element.setAttribute("title", "ignored");
  await nextTask();
  expect(seen).toEqual(["childList", "attribute data-state"]);
});

test("a change of the options builds a new observer with them", async () => {
  const { seen, callback } = recorder();
  const [filter, setFilter] = createSignal(["data-state"]);
  const ref = mount(() => createMutationObserver(callback, () => ({ attributeFilter: filter() })));
  const element = box("watched");
  ref(element);
  flush();

  setFilter(["title"]);
  flush();
  element.setAttribute("data-state", "open");
  element.setAttribute("title", "followed");
  await nextTask();
  expect(seen).toEqual(["attribute title"]);
});

test("without MutationObserver nothing is observed, and nothing throws", async () => {
  const { seen, callback } = recorder();
  const ref = mount(() => createMutationObserver(callback, { childList: true }));
  const element = box("watched");

  withoutGlobal("MutationObserver", () => {
    ref(element);
    flush();
  });
  element.append(document.createElement("span"));
  await nextTask();
  expect(seen).toEqual([]);
});
