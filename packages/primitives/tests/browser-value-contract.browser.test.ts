import { type Accessor, createSignal } from "solid-js";
import { describe, expect, test, vi } from "vite-plus/test";
import * as primitives from "../src/index";
import { flush, mount } from "./support/browser-harness";
import { observers } from "./support/browser-resources";
import type { PageValuePrimitive } from "./support/primitive-kinds";
import { replaced } from "./support/replace";
import { serverCases } from "./support/server-cases";
import { applied, stubbedScroll } from "./support/scroll";

type ValueContract = {
  create: (raw: Accessor<number>) => () => unknown;
  before?: () => Promise<void>;
};

const contracts: { [K in PageValuePrimitive]: () => ValueContract } = {
  createActiveElement: () => ({
    create: (raw) => primitives.createActiveElement({ deep: () => Math.round(raw()) >= 0 }),
  }),
  createDocumentVisibility: () => ({ create: () => primitives.createDocumentVisibility() }),
  createHeadroom: () => {
    const scroll = stubbedScroll(0);
    return {
      create: (raw) => {
        const headroom = primitives.createHeadroom({ fixedAt: () => Math.round(raw()) });
        return () => [headroom.pinned(), headroom.scrollProgress()];
      },
      before: async () => {
        scroll.to(50);
        await applied();
      },
    };
  },
  createMediaQuery: () => ({
    create: (raw) => primitives.createMediaQuery(() => `(min-width: ${Math.round(raw())}px)`),
  }),
  createScrollDirection: () => ({ create: () => primitives.createScrollDirection() }),
  createTextSelection: () => ({ create: () => primitives.createTextSelection() }),
  createViewportSize: () => ({
    create: () => {
      const size = primitives.createViewportSize();
      return () => [size.width(), size.height()];
    },
  }),
  createWindowScroll: () => ({
    create: () => {
      const [position] = primitives.createWindowScroll();
      return position;
    },
  }),
};

const missingApis: { [K in PageValuePrimitive]: () => () => void } = {
  createActiveElement: () => replaced(document, "activeElement", undefined),
  createDocumentVisibility: () => replaced(document, "visibilityState", undefined),
  createHeadroom: () => replaced(window, "scrollY", undefined),
  createMediaQuery: () => replaced(window, "matchMedia", undefined),
  createScrollDirection: () => replaced(window, "scrollY", undefined),
  createTextSelection: () => replaced(document, "getSelection", undefined),
  createViewportSize: () => {
    const restores = [
      replaced(window, "innerWidth", undefined),
      replaced(window, "innerHeight", undefined),
    ];
    return () => {
      for (const restore of restores.reverse()) restore();
    };
  },
  createWindowScroll: () => {
    const restores = [
      replaced(window, "scrollX", undefined),
      replaced(window, "scrollY", undefined),
    ];
    return () => {
      for (const restore of restores.reverse()) restore();
    };
  },
};

function registrationsDuring(run: () => void): number {
  const spies = [
    vi.spyOn(EventTarget.prototype, "addEventListener"),
    vi.spyOn(EventTarget.prototype, "removeEventListener"),
    ...observers.flatMap((name) => {
      const observer: { prototype: { observe(...target: never[]): void; disconnect(): void } } =
        Reflect.get(globalThis, name);
      return [vi.spyOn(observer.prototype, "observe"), vi.spyOn(observer.prototype, "disconnect")];
    }),
  ];
  try {
    run();
    return spies.reduce((total, spy) => total + spy.mock.calls.length, 0);
  } finally {
    for (const spy of spies) spy.mockRestore();
  }
}

describe.each(Object.keys(contracts) as PageValuePrimitive[])("%s", (name) => {
  test("an option that recomputes to an equal value keeps the subscription and the value built on it", async () => {
    const { create, before } = contracts[name]();
    const [raw, setRaw] = createSignal(0.1);
    const read = mount(() => create(raw));
    await before?.();
    const value = read();

    const registered = registrationsDuring(() => {
      setRaw(0.2);
      flush();
    });
    expect(registered).toBe(0);
    expect(read()).toEqual(value);
  });

  test("where its browser API is missing, it gives its loading value and throws nothing", () => {
    const { create, read, expected } = serverCases[name];
    const restore = missingApis[name]();
    try {
      const returned = mount(() => create(Reflect.get(primitives, String(name))));

      expect(read?.(returned as never)).toEqual(expected);
    } finally {
      restore();
    }
  });
});
