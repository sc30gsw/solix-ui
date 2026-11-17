import { createSignal } from "solid-js";
import { expect, test } from "vite-plus/test";
import {
  createAttachment,
  createElementAttachment,
  createElementAttachmentWhen,
} from "#/src/internal-attachment.ts";
import { flush, mount, unmount } from "#/tests/support/browser-harness.ts";
import { box } from "#/tests/support/dom.ts";

test("createAttachment attaches a defined config, keeps one equal by value, detaches when it turns undefined or changes, and detaches on dispose", () => {
  const seen: string[] = [];
  const [config, setConfig] = createSignal<{ name: string } | undefined>({ name: "a" });
  mount(() =>
    createAttachment((current) => {
      seen.push(`attach ${current.name}`);
      return () => seen.push(`detach ${current.name}`);
    }, config),
  );

  setConfig({ name: "a" });
  flush();
  setConfig(undefined);
  flush();
  setConfig({ name: "b" });
  flush();
  unmount();
  expect(seen).toEqual(["attach a", "detach a", "attach b", "detach b"]);
});

test("createAttachment without a config attaches once the owner's effects run and detaches on dispose", () => {
  const seen: string[] = [];
  mount(() =>
    createAttachment(() => {
      seen.push("attach");
      return () => seen.push("detach");
    }),
  );

  seen.push("mounted");
  unmount();
  expect(seen).toEqual(["attach", "mounted", "detach"]);
});

test("createElementAttachmentWhen hands the config the element its ref received, and attaches nothing once the owner is disposed", () => {
  const seen: string[] = [];
  const first = box("first");
  const ref = mount(() =>
    createElementAttachmentWhen<HTMLElement, string>(
      (current) => {
        seen.push(`attach ${current}`);
        return () => seen.push(`detach ${current}`);
      },
      (element) => element?.textContent ?? undefined,
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

test("createElementAttachment attaches to each element its ref receives, again when its config changes to a different value, and not for one equal by value", () => {
  const seen: string[] = [];
  const [config, setConfig] = createSignal({ name: "a" });
  const ref = mount(() =>
    createElementAttachment<HTMLElement, { name: string }>((element, current) => {
      seen.push(`attach ${element.textContent} ${current.name}`);
      return () => seen.push(`detach ${element.textContent} ${current.name}`);
    }, config),
  );

  ref(box("first"));
  flush();
  setConfig({ name: "a" });
  flush();
  setConfig({ name: "b" });
  flush();
  ref(box("second"));
  flush();
  expect(seen).toEqual([
    "attach first a",
    "detach first a",
    "attach first b",
    "detach first b",
    "attach second b",
  ]);
});

test("createElementAttachment without a config attaches to the element alone", () => {
  const seen: string[] = [];
  const ref = mount(() =>
    createElementAttachment<HTMLElement>((element) => {
      seen.push(`attach ${element.textContent}`);
      return () => seen.push(`detach ${element.textContent}`);
    }),
  );

  ref(box("first"));
  flush();
  unmount();
  expect(seen).toEqual(["attach first", "detach first"]);
});
