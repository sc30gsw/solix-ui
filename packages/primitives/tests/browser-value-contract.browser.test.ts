import { type Accessor, createSignal } from "solid-js";
import { describe, expect, test, vi } from "vite-plus/test";
import * as primitives from "../src/index";
import { flush, mount } from "./support/browser-harness";
import { observers } from "./support/browser-resources";
import type { PageValuePrimitive } from "./support/primitive-kinds";
import { replaced } from "./support/replace";
import { serverCases } from "./support/server-cases";

type ValueContract = {
  create: (raw: Accessor<number>) => () => unknown;
  before?: () => Promise<void>;
};

const contracts: { [K in PageValuePrimitive]: () => ValueContract } = {
  createMediaQuery: () => ({
    create: (raw) => primitives.createMediaQuery(() => `(min-width: ${Math.round(raw())}px)`),
  }),
};

const missingApis: { [K in PageValuePrimitive]: () => () => void } = {
  createMediaQuery: () => replaced(window, "matchMedia", undefined),
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
