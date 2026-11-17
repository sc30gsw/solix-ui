import { type Accessor, createRoot, createSignal } from "solid-js";
import { describe, expect, test } from "vite-plus/test";
import { userEvent } from "vite-plus/test/browser";
import { replaced } from "#/tests/support/replace.ts";
import type { BrowserValuePrimitive, ElementPrimitive } from "#/fixtures/primitive-kinds.ts";
import { startCase } from "#/fixtures/server-cases.ts";
import * as primitives from "#/src/index.ts";
import {
  attachmentsDuring,
  flush,
  mount,
  record,
  unmount,
} from "#/tests/support/browser-harness.ts";
import { observers } from "#/tests/support/browser-resources.ts";
import {
  box,
  button,
  controlFor,
  nextTask,
  press,
  settled,
  witnessed,
} from "#/tests/support/dom.ts";

type Contracted = {
  ref: primitives.RefSetter<HTMLElement>;
  actsOn: (element: HTMLElement) => Promise<boolean>;
  read?: () => unknown;
};

type Reading = Contracted & Required<Pick<Contracted, "read">>;

type Contract<K extends ElementPrimitive> = {
  make: () => (tick: Accessor<number>) => K extends BrowserValuePrimitive ? Reading : Contracted;
  alreadyOn?: (element: HTMLElement) => Promise<unknown>;
};

const ping = "solix-ping";

async function resizes(element: HTMLElement, width: () => number): Promise<boolean> {
  const expected = Math.round(element.getBoundingClientRect().width) + 7;
  const control = controlFor("ResizeObserver", element);
  const reports = control.seen.length;
  element.style.boxSizing = "border-box";
  element.style.width = `${expected}px`;
  await witnessed(control.seen, (seen) => seen.length > reports, "the resize");
  control.disconnect();
  await settled();
  return width() === expected;
}

function inView(seen: readonly IntersectionObserverEntry[]): boolean {
  return seen.at(-1)?.isIntersecting === true;
}

async function seesItLeave(element: HTMLElement, inside: () => boolean): Promise<boolean> {
  const control = controlFor("IntersectionObserver", element);
  await witnessed(control.seen, inView, "the element in view");
  const before = inside();
  element.hidden = true;
  await witnessed(control.seen, (seen) => !inView(seen), "the element leaving");
  const after = inside();
  element.hidden = false;
  await witnessed(control.seen, inView, "the element back in view");
  control.disconnect();
  return before && !after;
}

const contracts: { [K in ElementPrimitive]: Contract<K> } = {
  createClickOutside: {
    make: () => {
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
  },
  createElementSize: {
    make: () => (tick) => {
      const size = primitives.createElementSize<HTMLElement>(() => ({
        box: tick() >= 0 ? "border-box" : "content-box",
      }));
      return {
        ref: size.ref,
        actsOn: (element) => resizes(element, size.width),
        read: () => [size.width(), size.height()],
      };
    },
  },
  createEventListener: {
    make: () => {
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
  },
  createFocusTrap: {
    make: () => (tick) => ({
      ref: primitives.createFocusTrap(() => tick() >= 0),
      actsOn: async (element) => {
        await nextTask();
        const outside = button("outside");
        outside.focus();
        outside.remove();
        return element.contains(document.activeElement);
      },
    }),
  },
  createFocusWithin: {
    make: () => () => {
      const within = primitives.createFocusWithin<HTMLElement>();
      return {
        ref: within.ref,
        actsOn: async (element) => {
          const outside = button("outside");
          outside.focus();
          const entered = record(element, "focusin", true);
          element.querySelector("button")?.focus();
          await witnessed(entered, (seen) => seen.length > 0, "the focusin");
          const acted = within.focused();
          outside.focus();
          outside.remove();
          return acted;
        },
        read: within.focused,
      };
    },
    alreadyOn: async (element) => {
      element.querySelector("button")?.focus();
      return true;
    },
  },
  createHover: {
    make: () => () => {
      const hover = primitives.createHover<HTMLElement>();
      return {
        ref: hover.ref,
        actsOn: async (element) => {
          const away = box("away");
          await userEvent.hover(away);
          const entered = record(element, "mouseenter");
          await userEvent.hover(element);
          await witnessed(entered, (seen) => seen.length > 0, "the mouseenter");
          const acted = hover.hovered();
          await userEvent.hover(away);
          away.remove();
          return acted;
        },
        read: hover.hovered,
      };
    },
    alreadyOn: async (element) => {
      await userEvent.hover(element);
      return true;
    },
  },
  createInViewport: {
    make: () => () => {
      const viewport = primitives.createInViewport<HTMLElement>();
      return {
        ref: viewport.ref,
        actsOn: (element) => seesItLeave(element, viewport.inViewport),
        read: viewport.inViewport,
      };
    },
  },
  createIntersection: {
    make: () => (tick) => {
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
        read: () => intersection.entry()?.isIntersecting ?? null,
      };
    },
  },
  createMutationObserver: {
    make: () => {
      const targets: Node[] = [];
      return (tick) => ({
        ref: primitives.createMutationObserver(
          (records) => targets.push(...records.map(({ target }) => target)),
          () => ({ childList: tick() >= 0, attributeFilter: ["data-state"] }),
        ),
        actsOn: async (element) => {
          targets.length = 0;
          const control = controlFor("MutationObserver", element, { childList: true });
          element.append(document.createElement("span"));
          await witnessed(control.seen, (seen) => seen.length > 0, "the mutation");
          control.disconnect();
          return targets.includes(element);
        },
      });
    },
  },
  createResizeObserver: {
    make: () => (tick) => {
      const [ref, rect] = primitives.createResizeObserver<HTMLElement>(() => ({
        box: tick() >= 0 ? "border-box" : "content-box",
      }));
      return {
        ref,
        actsOn: (element) => resizes(element, () => rect().width),
        read: rect,
      };
    },
  },
};

function element(label: string): HTMLElement {
  const region = box(label);
  button(`${label} stop`, region);
  return region;
}

function initialOf(name: ElementPrimitive): unknown {
  return createRoot((dispose) => {
    const expected = startCase(name, primitives).value?.expected;
    dispose();
    return expected;
  });
}

describe.each(Object.keys(contracts) as ElementPrimitive[])("%s", (name) => {
  const contract: Contract<ElementPrimitive> = contracts[name];

  function mounted() {
    const create = contract.make();
    const [tick, setTick] = createSignal(0);
    const contracted = mount(() => create(tick));
    return { ...contracted, setTick };
  }

  test("nothing is attached before the ref receives an element", async () => {
    const { result, listened, observed } = await attachmentsDuring(mounted);

    expect([listened, observed]).toEqual([[], []]);
    expect(await result.actsOn(element("first"))).toBe(false);
  });

  test("the attachment moves to each element the ref receives, and right after a move no value describes the old element", async () => {
    const { ref, actsOn, read } = mounted();
    const first = element("first");
    const second = element("second");

    ref(first);
    flush();
    const onFirst = await actsOn(first);
    ref(second);
    flush();
    const afterTheMove = read?.();
    expect([onFirst, await actsOn(first), await actsOn(second)]).toEqual([true, false, true]);
    expect(afterTheMove).toEqual(initialOf(name));
  });

  test.runIf(contract.alreadyOn)(
    "a ref put on an element already in the state it reports reads it at once",
    async () => {
      const { ref, read } = mounted();
      const first = element("first");
      const expected = await contract.alreadyOn?.(first);

      ref(first);
      flush();
      expect(read?.()).toEqual(expected);
    },
  );

  test("with every observer class missing, it attaches without a throw and a value keeps its initial value", async () => {
    await userEvent.hover(box("away"));
    const restores = observers.map((observer) => replaced(window, observer, undefined));
    try {
      const { ref, read } = mounted();
      ref(element("first"));
      flush();
      await settled();

      expect(read?.()).toEqual(initialOf(name));
    } finally {
      for (const restore of restores) restore();
    }
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

    const { listened, observed, removed } = await attachmentsDuring(() => {
      setTick(1);
      flush();
      ref(first);
      flush();
      setTick(2);
      flush();
    });
    expect([listened, observed, removed]).toEqual([[], [], []]);
    expect(await actsOn(first)).toBe(true);
  });

  test("a child that stops the propagation of every event type the primitive listens to changes nothing it reads", async () => {
    const first = element("first");
    const { result, listened } = await attachmentsDuring(() => {
      const contracted = mounted();
      contracted.ref(first);
      flush();
      return contracted;
    });
    const child = first.querySelector("button");
    for (const type of new Set(listened)) {
      child?.addEventListener(type, (event) => event.stopPropagation());
    }

    expect(await result.actsOn(first)).toBe(true);
  });
});
