import { expect } from "vite-plus/test";
import { modal } from "#/spec/fixtures.ts";
import { defineReference, defineSpec, dom } from "#/spec/format.ts";

const reference = defineReference({
  props: ["closeOnEscape", "zIndex"],
  parts: [],
  variables: ["--mb-z-index"],
});

export const spec = defineSpec(reference, [
  {
    says: "closeOnEscape={false} keeps the Modal open on Escape",
    promise: { kind: "prop", prop: "closeOnEscape", value: false },
    check: dom(modal({ closeOnEscape: false }), async ({ root, update, user }) => {
      update({ onClose: () => update({ opened: false }) });
      await user.keyboard("{Escape}");
      expect(root.matches("[open]"), "open after Escape").toBe(true);
    }),
    status: "pending",
    until: "Modal 2",
    failsWith: "open after Escape: expected false to be true",
    decision: "Q172",
  },
  {
    says: "zIndex={0} sets --mb-z-index to 0 on the Modal's root",
    promise: { kind: "prop", prop: "zIndex", value: 0 },
    check: dom(modal({ zIndex: 0 }), ({ root }) => {
      expect(getComputedStyle(root).getPropertyValue("--mb-z-index"), "--mb-z-index").toBe("0");
    }),
    status: "pending",
    until: "Modal 8",
    failsWith: "--mb-z-index: expected '' to be '0'",
    decision: "Q173",
  },
  {
    says: "with no zIndex, --mb-z-index is set to the default layer",
    promise: { kind: "variable", variable: "--mb-z-index" },
    check: dom(modal(), ({ root }) => {
      expect(getComputedStyle(root).getPropertyValue("--mb-z-index"), "--mb-z-index").not.toBe("");
    }),
    status: "pending",
    until: "Modal 8",
    failsWith: "--mb-z-index: expected '' not to be ''",
    decision: "Q173",
  },
]);
