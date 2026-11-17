import { createSignal } from "solid-js";
import { afterEach, expect, test } from "vite-plus/test";
import { createMutationObserverTarget } from "#/src/index.ts";
import { flush, mount, unmount } from "#/tests/support/browser-harness.ts";
import { box, nextTask } from "#/tests/support/dom.ts";
import { withoutGlobal } from "#/tests/support/replace.ts";

const marker = "data-solix-observed";

afterEach(() => {
  document.documentElement.removeAttribute(marker);
});

function recorder() {
  const targets: Node[] = [];
  const callback: MutationCallback = (records) => {
    for (const record of records) targets.push(record.target);
  };
  return { targets, callback };
}

test("it observes a node given directly", async () => {
  const { targets, callback } = recorder();
  const element = box("watched");
  mount(() => createMutationObserverTarget(callback, { attributes: true }, element));

  element.setAttribute(marker, "");
  await nextTask();
  expect(targets).toEqual([element]);
});

test("an accessor may reach a node that only the browser has, such as the document element", async () => {
  const { targets, callback } = recorder();
  mount(() =>
    createMutationObserverTarget(
      callback,
      { attributeFilter: [marker] },
      () => document.documentElement,
    ),
  );

  document.documentElement.setAttribute(marker, "");
  await nextTask();
  expect(targets).toEqual([document.documentElement]);
});

test("a change of the target moves the observer, and no target observes nothing", async () => {
  const { targets, callback } = recorder();
  const first = box("first");
  const second = box("second");
  const [target, setTarget] = createSignal<Node | undefined>(first);
  mount(() => createMutationObserverTarget(callback, { childList: true }, target));

  setTarget(second);
  flush();
  first.append("ignored");
  second.append("followed");
  await nextTask();
  setTarget(undefined);
  flush();
  second.append("ignored");
  await nextTask();
  expect(targets).toEqual([second]);
});

test("once the owner is disposed the target is no longer observed", async () => {
  const { targets, callback } = recorder();
  const element = box("watched");
  mount(() => createMutationObserverTarget(callback, { childList: true }, element));

  unmount();
  element.append("ignored");
  await nextTask();
  expect(targets).toEqual([]);
});

test("without MutationObserver nothing is observed, and nothing throws", async () => {
  const { targets, callback } = recorder();
  const element = box("watched");

  withoutGlobal("MutationObserver", () => {
    mount(() => createMutationObserverTarget(callback, { childList: true }, element));
  });
  element.append("ignored");
  await nextTask();
  expect(targets).toEqual([]);
});

test("the document itself can be the target", async () => {
  const { targets, callback } = recorder();
  mount(() =>
    createMutationObserverTarget(callback, { childList: true, subtree: true }, () => document),
  );

  const added = box("added");
  await nextTask();
  expect(targets).toContain(added.parentNode);
});
