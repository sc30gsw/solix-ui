import { type Accessor, createSignal } from "solid-js";
import { describe, expect, test, vi } from "vite-plus/test";
import * as primitives from "../src/index";
import { flush, mount, unmount } from "./support/browser-harness";
import { observers } from "./support/browser-resources";
import { box, button, nextTask, press } from "./support/dom";
import type { ElementPrimitive } from "./support/primitive-kinds";

type Contracted = {
  ref: primitives.RefSetter<HTMLElement>;
  actsOn: (element: HTMLElement) => Promise<boolean>;
  value?: { read: () => unknown; initial: unknown };
};

type Contract = (tick: Accessor<number>) => Contracted;

const ping = "solix-ping";

const contracts: { [K in ElementPrimitive]: () => Contract } = {
  createClickOutside: () => {
    const calls: string[] = [];
    return (tick) => ({
      ref: primitives.createClickOutside(
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
    });
  },
  createEventListener: () => {
    const targets: (EventTarget | null)[] = [];
    return (tick) => ({
      ref: primitives.createEventListener(
        ping,
        (event) => targets.push(event.currentTarget),
        () => ({ passive: tick() >= 0 }),
      ),
      actsOn: async (element) => {
        targets.length = 0;
        element.dispatchEvent(new Event(ping));
        return targets.includes(element);
      },
    });
  },
  createFocusTrap: () => (tick) => ({
    ref: primitives.createFocusTrap(() => tick() >= 0),
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

type Observable = { observe(...target: never[]): void; disconnect(): void };

function observerPrototypes(): Observable[] {
  return observers.map((name) => {
    const observer: { prototype: Observable } = Reflect.get(globalThis, name);
    return observer.prototype;
  });
}

function attachmentsDuring<T>(run: () => T): {
  result: T;
  added: number;
  removed: number;
  types: string[];
} {
  const listened = vi.spyOn(EventTarget.prototype, "addEventListener");
  const added = [
    listened,
    ...observerPrototypes().map((prototype) => vi.spyOn(prototype, "observe")),
  ];
  const removed = [
    vi.spyOn(EventTarget.prototype, "removeEventListener"),
    ...observerPrototypes().map((prototype) => vi.spyOn(prototype, "disconnect")),
  ];
  const calls = (spies: { mock: { calls: unknown[] } }[]) =>
    spies.reduce((total, spy) => total + spy.mock.calls.length, 0);
  try {
    const result = run();
    const types = listened.mock.calls.map(([type]) => type);
    return { result, added: calls(added), removed: calls(removed), types };
  } finally {
    for (const spy of [...added, ...removed]) spy.mockRestore();
  }
}

describe.each(Object.entries(contracts))("%s", (_name, contract) => {
  function mounted() {
    const create = contract();
    const [tick, setTick] = createSignal(0);
    const contracted = mount(() => create(tick));
    return { ...contracted, setTick };
  }

  test("nothing is attached before the ref receives an element", async () => {
    const { result, added } = attachmentsDuring(mounted);

    expect(added).toBe(0);
    expect(await result.actsOn(element("first"))).toBe(false);
  });

  test("the attachment moves to each element the ref receives, and right after a move no value describes the old element", async () => {
    const { ref, actsOn, value } = mounted();
    const first = element("first");
    const second = element("second");

    ref(first);
    flush();
    const onFirst = await actsOn(first);
    ref(second);
    flush();
    const afterTheMove = value?.read();
    expect([onFirst, await actsOn(first), await actsOn(second)]).toEqual([true, false, true]);
    expect(afterTheMove).toEqual(value?.initial);
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

  test("a child that stops the propagation of every event type the primitive listens to changes nothing it reads", async () => {
    const first = element("first");
    const { result, types } = attachmentsDuring(() => {
      const contracted = mounted();
      contracted.ref(first);
      flush();
      return contracted;
    });
    const child = first.querySelector("button");
    for (const type of new Set(types)) {
      child?.addEventListener(type, (event) => event.stopPropagation());
    }

    expect(await result.actsOn(first)).toBe(true);
  });
});
