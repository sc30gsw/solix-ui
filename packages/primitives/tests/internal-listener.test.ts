import { expect, test } from "vite-plus/test";
import { disposeAll, listen, listenerSettings } from "../src/internal-listener";

test("listenerSettings reads a boolean as capture and fills every option an object leaves out", () => {
  const signal = new AbortController().signal;

  expect([
    listenerSettings("ping"),
    listenerSettings("ping", true),
    listenerSettings("ping", { passive: true, once: true, signal }),
  ]).toEqual([
    { type: "ping", capture: false, passive: undefined, once: undefined, signal: undefined },
    { type: "ping", capture: true, passive: undefined, once: undefined, signal: undefined },
    { type: "ping", capture: false, passive: true, once: true, signal },
  ]);
});

test("listen adds the listener with its options and returns what removes it with the same capture", () => {
  const target = new EventTarget();
  const seen: string[] = [];
  const remove = listen(target, listenerSettings("ping", { capture: true, once: true }), (event) =>
    seen.push(event.type),
  );

  target.dispatchEvent(new Event("ping"));
  target.dispatchEvent(new Event("ping"));
  remove();
  const again = listen(target, listenerSettings("ping", true), () => seen.push("again"));
  again();
  target.dispatchEvent(new Event("ping"));
  expect(seen).toEqual(["ping"]);
});

test("disposeAll returns one function that runs every disposer in order", () => {
  const seen: number[] = [];
  disposeAll([() => seen.push(1), () => seen.push(2)])();

  expect(seen).toEqual([1, 2]);
});
