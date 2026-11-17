import { expect, test } from "vite-plus/test";
import { observe, observerNames } from "#/src/internal-dom-observer.ts";
import { mount, reportAfterDispose } from "#/tests/support/browser-harness.ts";
import { observers } from "#/tests/support/browser-resources.ts";
import { box, nextTask } from "#/tests/support/dom.ts";
import { withoutGlobal } from "#/tests/support/replace.ts";

test("the leak harness and the server trap read the observer classes from observerNames", () => {
  expect(observers).toBe(observerNames);
});

test("observe reports entries to the callback and disconnects when torn down", async () => {
  const target = box("observed");
  const seen: string[] = [];
  const stop = mount(() =>
    observe("MutationObserver", target, { childList: true }, (records) =>
      seen.push(...records.map(({ type }) => type)),
    ),
  );

  target.append("added");
  await nextTask();
  stop();
  target.append("ignored");
  await nextTask();
  expect(seen).toEqual(["childList"]);
});

test("observe watches a document itself, which has no owner document", async () => {
  const seen: string[] = [];
  const stop = mount(() =>
    observe("MutationObserver", document, { childList: true, subtree: true }, (records) =>
      seen.push(...records.map(({ type }) => type)),
    ),
  );

  box("added");
  await nextTask();
  stop();
  expect(seen).toEqual(["childList"]);
});

test("where the observer class is missing, observe observes nothing and throws nothing", () => {
  const stop = withoutGlobal("ResizeObserver", () =>
    observe("ResizeObserver", box("observed"), undefined, () => undefined),
  );

  stop();
  expect(reportAfterDispose()).toEqual([]);
});

test("an observation that throws, as for options that ask for nothing, throws to the caller and leaves nothing observed", () => {
  expect(() =>
    mount(() => observe("MutationObserver", box("observed"), {}, () => undefined)),
  ).toThrow(TypeError);
  expect(reportAfterDispose()).toEqual([]);
});
