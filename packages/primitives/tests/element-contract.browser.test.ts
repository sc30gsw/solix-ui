import { type Accessor, createSignal } from "solid-js";
import { describe, expect, test, vi } from "vite-plus/test";
import * as primitives from "../src/index";
import { flush, mount, unmount } from "./support/browser-harness";
import { box, button, nextTask, press } from "./support/dom";

type Library = typeof primitives;
type ElementPrimitive = {
  [K in keyof Library]: Library[K] extends (...args: never[]) => (...element: infer A) => void
    ? A extends [Element]
      ? K
      : never
    : never;
}[keyof Library];

type Contract = {
  create: (tick: Accessor<number>) => primitives.RefSetter<HTMLElement>;
  actsOn: (element: HTMLElement) => Promise<boolean>;
};

const ping = "solix-ping";

const contracts: { [K in ElementPrimitive]: () => Contract } = {
  createClickOutside: () => {
    const calls: string[] = [];
    return {
      create: (tick) =>
        primitives.createClickOutside(
          () => calls.push("outside"),
          null,
          null,
          () => tick() >= 0,
        ),
      actsOn: async (element) => {
        calls.length = 0;
        await press(element);
        await press(box("elsewhere"));
        return calls.length === 1;
      },
    };
  },
  createEventListener: () => {
    const targets: (EventTarget | null)[] = [];
    return {
      create: (tick) =>
        primitives.createEventListener(
          ping,
          (event) => targets.push(event.currentTarget),
          () => ({ passive: tick() >= 0 }),
        ),
      actsOn: async (element) => {
        targets.length = 0;
        element.dispatchEvent(new Event(ping));
        return targets.includes(element);
      },
    };
  },
  createFocusTrap: () => ({
    create: (tick) => primitives.createFocusTrap(() => tick() >= 0),
    actsOn: async (element) => {
      await nextTask();
      const outside = button("outside");
      outside.focus();
      outside.remove();
      return element.contains(document.activeElement);
    },
  }),
};

function element(label: string): HTMLElement {
  const region = box(label);
  button(`${label} stop`, region);
  return region;
}

function attachmentsDuring<T>(run: () => T): { result: T; added: number; removed: number } {
  const added = vi.spyOn(EventTarget.prototype, "addEventListener");
  const removed = vi.spyOn(EventTarget.prototype, "removeEventListener");
  try {
    const result = run();
    return { result, added: added.mock.calls.length, removed: removed.mock.calls.length };
  } finally {
    added.mockRestore();
    removed.mockRestore();
  }
}

describe.each(Object.entries(contracts))("%s", (_name, contract) => {
  function mounted() {
    const { create, actsOn } = contract();
    const [tick, setTick] = createSignal(0);
    const ref = mount(() => create(tick));
    return { ref, actsOn, setTick };
  }

  test("nothing is attached before the ref receives an element", async () => {
    const { result, added } = attachmentsDuring(mounted);

    expect(added).toBe(0);
    expect(await result.actsOn(element("first"))).toBe(false);
  });

  test("the attachment moves to each element the ref receives", async () => {
    const { ref, actsOn } = mounted();
    const first = element("first");
    const second = element("second");

    ref(first);
    flush();
    const onFirst = await actsOn(first);
    ref(second);
    flush();
    expect([onFirst, await actsOn(first), await actsOn(second)]).toEqual([true, false, true]);
  });

  test("the attachment is removed when the owner is disposed", async () => {
    const { ref, actsOn } = mounted();
    const first = element("first");
    ref(first);
    flush();

    unmount();
    expect(await actsOn(first)).toBe(false);
  });

  test("after its owner is disposed, the ref records nothing", async () => {
    const { ref, actsOn } = mounted();
    const first = element("first");

    unmount();
    ref(first);
    flush();
    expect(await actsOn(first)).toBe(false);
  });

  test("a config equal by value, or the same element again, keeps the attachment", async () => {
    const { ref, actsOn, setTick } = mounted();
    const first = element("first");
    ref(first);
    flush();

    const { added, removed } = attachmentsDuring(() => {
      setTick(1);
      flush();
      ref(first);
      flush();
      setTick(2);
      flush();
    });
    expect([added, removed]).toEqual([0, 0]);
    expect(await actsOn(first)).toBe(true);
  });
});
