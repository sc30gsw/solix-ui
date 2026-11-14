import { type Accessor, createSignal } from "solid-js";
import { describe, expect, test, vi } from "vite-plus/test";
import { userEvent } from "vite-plus/test/browser";
import * as primitives from "../src/index";
import { flush, mount, record, unmount } from "./support/browser-harness";
import { observers } from "./support/browser-resources";
import { box, button, nextTask, press, settled, witnessed } from "./support/dom";
import type { ElementPrimitive } from "./support/primitive-kinds";

type Contracted = {
  ref: primitives.RefSetter<HTMLElement>;
  actsOn: (element: HTMLElement) => Promise<boolean>;
  value?: { read: () => unknown; initial: unknown };
};

type Contract = (tick: Accessor<number>) => Contracted;

const ping = "solix-ping";

function controlObserver<T>(
  observe: (element: Element, seen: T[]) => { disconnect: () => void },
  element: Element,
): { seen: T[]; disconnect: () => void } {
  const seen: T[] = [];
  const observer = observe(element, seen);
  return { seen, disconnect: () => observer.disconnect() };
}

function resizeControl(element: Element) {
  return controlObserver<ResizeObserverEntry>((target, seen) => {
    const observer = new ResizeObserver((entries) => seen.push(...entries));
    observer.observe(target);
    return observer;
  }, element);
}

function intersectionControl(element: Element) {
  return controlObserver<IntersectionObserverEntry>((target, seen) => {
    const observer = new IntersectionObserver((entries) => seen.push(...entries));
    observer.observe(target);
    return observer;
  }, element);
}

function mutationControl(element: Element) {
  return controlObserver<MutationRecord>((target, seen) => {
    const observer = new MutationObserver((records) => seen.push(...records));
    observer.observe(target, { childList: true });
    return observer;
  }, element);
}

async function resizes(element: HTMLElement, width: () => number): Promise<boolean> {
  const expected = Math.round(element.getBoundingClientRect().width) + 7;
  const control = resizeControl(element);
  const reports = control.seen.length;
  element.style.boxSizing = "border-box";
  element.style.width = `${expected}px`;
  await witnessed(() => control.seen.length > reports, "the resize");
  control.disconnect();
  await settled();
  return width() === expected;
}

async function seesItLeave(element: HTMLElement, inside: () => boolean): Promise<boolean> {
  const control = intersectionControl(element);
  await witnessed(() => control.seen.at(-1)?.isIntersecting === true, "the element in view");
  const before = inside();
  element.hidden = true;
  await witnessed(() => control.seen.at(-1)?.isIntersecting === false, "the element leaving");
  const after = inside();
  element.hidden = false;
  await witnessed(() => control.seen.at(-1)?.isIntersecting === true, "the element back in view");
  control.disconnect();
  return before && !after;
}

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
  createElementSize: () => (tick) => {
    const size = primitives.createElementSize<HTMLElement>(() => ({
      box: tick() >= 0 ? "border-box" : "content-box",
    }));
    return {
      ref: size.ref,
      actsOn: (element) => resizes(element, size.width),
      value: { read: () => [size.width(), size.height()], initial: [0, 0] },
    };
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
  createFocusWithin: () => () => {
    const within = primitives.createFocusWithin<HTMLElement>();
    return {
      ref: within.ref,
      actsOn: async (element) => {
        const outside = button("outside");
        outside.focus();
        const entered = record(element, "focusin", true);
        element.querySelector("button")?.focus();
        await witnessed(() => entered.length > 0, "the focusin");
        const acted = within.focused();
        outside.focus();
        outside.remove();
        return acted;
      },
      value: { read: within.focused, initial: false },
    };
  },
  createHover: () => () => {
    const hover = primitives.createHover<HTMLElement>();
    return {
      ref: hover.ref,
      actsOn: async (element) => {
        const away = box("away");
        await userEvent.hover(away);
        const entered = record(element, "mouseenter");
        await userEvent.hover(element);
        await witnessed(() => entered.length > 0, "the mouseenter");
        const acted = hover.hovered();
        await userEvent.hover(away);
        away.remove();
        return acted;
      },
      value: { read: hover.hovered, initial: false },
    };
  },
  createInViewport: () => () => {
    const viewport = primitives.createInViewport<HTMLElement>();
    return {
      ref: viewport.ref,
      actsOn: (element) => seesItLeave(element, viewport.inViewport),
      value: { read: viewport.inViewport, initial: false },
    };
  },
  createIntersection: () => (tick) => {
    const intersection = primitives.createIntersection<HTMLElement>(() => ({
      threshold: [0, tick() >= 0 ? 1 : 0.5],
    }));
    return {
      ref: intersection.ref,
      actsOn: (element) =>
        seesItLeave(
          element,
          () =>
            intersection.entry()?.target === element &&
            intersection.entry()?.isIntersecting === true,
        ),
      value: { read: intersection.entry, initial: null },
    };
  },
  createMutationObserver: () => {
    const targets: Node[] = [];
    return (tick) => ({
      ref: primitives.createMutationObserver(
        (records) => targets.push(...records.map(({ target }) => target)),
        () => ({ childList: tick() >= 0, attributeFilter: ["data-state"] }),
      ),
      actsOn: async (element) => {
        targets.length = 0;
        const control = mutationControl(element);
        element.append(document.createElement("span"));
        await witnessed(() => control.seen.length > 0, "the mutation");
        control.disconnect();
        return targets.includes(element);
      },
    });
  },
  createResizeObserver: () => (tick) => {
    const [ref, rect] = primitives.createResizeObserver<HTMLElement>(() => ({
      box: tick() >= 0 ? "border-box" : "content-box",
    }));
    return {
      ref,
      actsOn: (element) => resizes(element, () => rect().width),
      value: {
        read: rect,
        initial: { x: 0, y: 0, width: 0, height: 0, top: 0, left: 0, bottom: 0, right: 0 },
      },
    };
  },
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
