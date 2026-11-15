import { createSignal } from "solid-js";
import { expect, test } from "vite-plus/test";
import {
  createAttachment,
  createElementAttachment,
  createElementValue,
} from "../src/internal-attachment";
import { flush, mount, unmount } from "./support/browser-harness";
import { box } from "./support/dom";

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

test("createElementValue starts at its initial value, takes what the attachment delivers, and goes back to it when an attachment ends", () => {
  const first = box("first");
  const second = box("second");
  const [ref, label] = mount(() =>
    createElementValue<HTMLElement, string, string>(
      "none",
      (element, suffix, deliver) => {
        deliver(`${element.textContent} ${suffix}`);
        return () => undefined;
      },
      () => "seen",
    ),
  );
  const seen = [label()];

  ref(first);
  flush();
  seen.push(label());
  ref(second);
  flush();
  seen.push(label());
  unmount();
  seen.push(label());
  expect(seen).toEqual(["none", "first seen", "second seen", "none"]);
});
