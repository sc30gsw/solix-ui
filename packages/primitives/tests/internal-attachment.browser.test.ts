import { createSignal } from "solid-js";
import { expect, test } from "vite-plus/test";
import { createAttachment, createElementAttachment } from "../src/internal-attachment";
import { flush, mount, unmount } from "./support/browser-harness";
import { box } from "./support/dom";

test("createAttachment attaches a defined config, detaches when it turns undefined or changes, keeps one that is the same, and detaches on dispose", () => {
  const seen: string[] = [];
  const [config, setConfig] = createSignal<string | undefined>("a");
  mount(() =>
    createAttachment(
      config,
      (current) => {
        seen.push(`attach ${current}`);
        return () => seen.push(`detach ${current}`);
      },
      (left, right) => left.toLowerCase() === right.toLowerCase(),
    ),
  );

  setConfig("A");
  flush();
  setConfig(undefined);
  flush();
  setConfig("b");
  flush();
  unmount();
  expect(seen).toEqual(["attach a", "detach a", "attach b", "detach b"]);
});

test("createElementAttachment hands the config the element its ref received, and attaches nothing once the owner is disposed", () => {
  const seen: string[] = [];
  const first = box("first");
  const ref = mount(() =>
    createElementAttachment<HTMLElement, string>(
      (element) => element?.textContent ?? undefined,
      (current) => {
        seen.push(`attach ${current}`);
        return () => seen.push(`detach ${current}`);
      },
    ),
  );

  flush();
  ref(first);
  flush();
  unmount();
  ref(box("second"));
  flush();
  expect(seen).toEqual(["attach first", "detach first"]);
});
