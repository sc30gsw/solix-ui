import { expect, test } from "vite-plus/test";
import {
  disposeAll,
  handleEvent,
  listenAsAsked,
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

test("listenAsAsked adds the listener with a consumer's options and returns what removes it with the same capture", () => {
  const target = new EventTarget();
  const seen: string[] = [];
  const remove = listenAsAsked(
    target,
    listenerSettings("ping", { capture: true, once: true }),
    (event: Event) => seen.push(event.type),
  );

  target.dispatchEvent(new Event("ping"));
  target.dispatchEvent(new Event("ping"));
  remove();
  const again = listenAsAsked(target, listenerSettings("ping", true), () => seen.push("again"));
  again();
  target.dispatchEvent(new Event("ping"));
  expect(seen).toEqual(["ping"]);
});

test("disposeAll returns one function that runs every disposer in order", () => {
  const seen: number[] = [];
  disposeAll([() => seen.push(1), () => seen.push(2)])();

  expect(seen).toEqual([1, 2]);
});

test("watchEvents listens to each type in the capture phase, and its disposer removes them all", () => {
  const target = new EventTarget();
  const seen: string[] = [];
  const remove = watchEvents(target, ["ping", "pong"], (event: Event) => seen.push(event.type), {
    passive: true,
  });

  target.dispatchEvent(new Event("ping"));
  target.dispatchEvent(new Event("pong"));
  remove();
  target.dispatchEvent(new Event("ping"));
  expect(seen).toEqual(["ping", "pong"]);
});

test("handleEvent listens on any target and skips an event whose default is already prevented", () => {
  const target = new EventTarget();
  const seen: boolean[] = [];
  const remove = handleEvent(target, "ping", (event: Event) => seen.push(event.defaultPrevented));
  const prevented = new Event("ping", { cancelable: true });
  prevented.preventDefault();

  target.dispatchEvent(new Event("ping", { cancelable: true }));
  target.dispatchEvent(prevented);
  remove();
  expect(seen).toEqual([false]);
});
