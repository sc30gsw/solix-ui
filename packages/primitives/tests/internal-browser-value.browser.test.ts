import { createSignal } from "solid-js";
import { expect, expectTypeOf, test } from "vite-plus/test";
import {
  type BrowserValueOptions,
  createBrowserValue,
  createClientMemo,
  readOn,
  type Subscription,
} from "../src/internal-browser-value";
import { flush, mount, reportAfterDispose, unmount, watch } from "./support/browser-harness";
import { nextTask } from "./support/dom";

const ping = "solix-ping";

async function pinged(target: EventTarget): Promise<void> {
  target.dispatchEvent(new Event(ping));
  await nextTask();
  flush();
}

function counter(start: number): Subscription<number, EventTarget> {
  return (deliver, keep, target) => {
    const seen = { count: start };
    deliver(seen.count);
    const onPing = () => {
      seen.count += 1;
      deliver(seen.count);
    };
    target.addEventListener(ping, onPing);
    keep(() => target.removeEventListener(ping, onPing));
  };
}

test("the loading value is required, so leaving it out is a type error", () => {
  expectTypeOf<{ equals: false }>().not.toExtend<BrowserValueOptions<number, undefined>>();
  expectTypeOf<{ loadingValue: number }>().toExtend<BrowserValueOptions<number, undefined>>();
});

test("in a page the browser renders alone, it reads the value the subscription delivers at once, then each value it delivers", async () => {
  const target = new EventTarget();
  const { value, seen } = mount(() => {
    const value = createBrowserValue(counter(1), { loadingValue: 0, config: () => target });
    return { value, seen: watch(value) };
  });

  expect(value()).toBe(1);
  await pinged(target);
  expect([value(), seen]).toEqual([2, [1, 2]]);
});

test("a config that changes to a different value ends the old subscription and starts a new one, and one equal by value keeps it", async () => {
  const first = new EventTarget();
  const second = new EventTarget();
  const [target, setTarget] = createSignal(first);
  const [tick, setTick] = createSignal(0);
  const { value, seen } = mount(() => {
    const value = createBrowserValue<number, { target: EventTarget; label: string }>(
      (deliver, keep, config) => counter(10)(deliver, keep, config.target),
      {
        loadingValue: 0,
        config: () => ({ target: target(), label: tick() >= 0 ? "same" : "other" }),
      },
    );
    return { value, seen: watch(value) };
  });

  await pinged(first);
  setTick(1);
  flush();
  expect([value(), seen]).toEqual([11, [10, 11]]);
  setTarget(second);
  flush();
  await pinged(first);
  expect(value()).toBe(10);
  await pinged(second);
  expect(value()).toBe(11);
});

test("an error a subscription throws reaches the caller, and what it registered before the throw is removed", () => {
  const target = new EventTarget();
  const failing: Subscription<number, undefined> = (deliver, keep) => {
    deliver(1);
    const onPing = () => deliver(2);
    target.addEventListener(ping, onPing);
    keep(() => target.removeEventListener(ping, onPing));
    throw new TypeError("a bug in the subscription");
  };

  const thrown = (() => {
    try {
      mount(() => createBrowserValue(failing, { loadingValue: 0 })());
      return undefined;
    } catch (error) {
      return error;
    }
  })();

  expect(thrown).toMatchObject({ message: "a bug in the subscription" });
  expect(Reflect.get(Object(thrown), "cause")).toBeInstanceOf(TypeError);
  expect(reportAfterDispose()).toEqual([]);
});

test("a SecurityError, as a sandboxed frame throws, gives the loading value, and what was registered is removed", () => {
  const target = new EventTarget();
  const blocked: Subscription<number, undefined> = (_deliver, keep) => {
    const onPing = () => undefined;
    target.addEventListener(ping, onPing);
    keep(() => target.removeEventListener(ping, onPing));
    throw new DOMException("blocked", "SecurityError");
  };
  const value = mount(() => createBrowserValue(blocked, { loadingValue: 7 }));

  expect(value()).toBe(7);
  expect(reportAfterDispose()).toEqual([]);
});

test("a value equal by value to the one before changes nothing, and equals false reports every value", async () => {
  const target = new EventTarget();
  const constant: Subscription<{ size: number }, undefined> = (deliver, keep) => {
    deliver({ size: 1 });
    const onPing = () => deliver({ size: 1 });
    target.addEventListener(ping, onPing);
    keep(() => target.removeEventListener(ping, onPing));
  };
  const { byValue, every } = mount(() => ({
    byValue: watch(createBrowserValue(constant, { loadingValue: { size: 0 } })),
    every: watch(createBrowserValue(constant, { loadingValue: { size: 0 }, equals: false })),
  }));

  await pinged(target);
  await pinged(target);
  expect([byValue.length, every.length]).toEqual([1, 3]);
});

test("the subscription ends when the owner is disposed", async () => {
  const target = new EventTarget();
  const value = mount(() =>
    createBrowserValue(counter(1), { loadingValue: 0, config: () => target }),
  );

  unmount();
  await pinged(target);
  expect(value()).toBe(1);
});

test("readOn delivers what it reads from its target at once and on each listed event, and nothing where there is no target", async () => {
  const target = new EventTarget();
  const reads = { count: 0 };
  const { found, missing } = mount(() => ({
    found: createBrowserValue(
      readOn(
        () => target,
        [ping],
        () => {
          reads.count += 1;
          return reads.count;
        },
      ),
      { loadingValue: 0 },
    ),
    missing: createBrowserValue(
      readOn(
        () => undefined,
        [ping],
        () => 1,
      ),
      { loadingValue: 0 },
    ),
  }));

  await pinged(target);
  expect([found(), missing()]).toEqual([2, 0]);
});

test("createClientMemo computes in the browser at once, outside hydration", () => {
  const value = mount(() => createClientMemo(() => "browser", "loading"));

  expect(value()).toBe("browser");
});
