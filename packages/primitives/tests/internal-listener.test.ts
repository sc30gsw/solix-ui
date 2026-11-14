import { expect, test } from "vite-plus/test";
import {
  disposeAll,
  handleEvent,
  listen,
  listenerSettings,
  watchEvents,
} from "../src/internal-listener";

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

test("watchEvents listens in the capture phase, so a handler on the target that stops the event hides nothing from it", () => {
  const parent = new EventTarget();
  const seen: string[] = [];
  const remove = watchEvents(parent, "ping", (event) => seen.push(event.type), { passive: true });

  parent.dispatchEvent(new Event("ping"));
  remove();
  parent.dispatchEvent(new Event("ping"));
  expect(seen).toEqual(["ping"]);
});

test("handleEvent skips an event whose default is already prevented", () => {
  const view = new EventTarget() as unknown as Window;
  const seen: boolean[] = [];
  const remove = handleEvent(view, "ping", (event) => seen.push(event.defaultPrevented));
  const prevented = new Event("ping", { cancelable: true });
  prevented.preventDefault();

  view.dispatchEvent(new Event("ping", { cancelable: true }));
  view.dispatchEvent(prevented);
  remove();
  expect(seen).toEqual([false]);
});
