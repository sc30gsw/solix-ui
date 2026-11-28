import { expect } from "vite-plus/test";
import { modal } from "#/spec/fixtures.ts";
import type { FunctionSpec, Reference } from "#/spec/format.ts";

const reference = {
  props: ["closeOnEscape", "zIndex"],
  parts: [],
  variables: ["--mb-z-index"],
} as const satisfies Reference;

export const spec: FunctionSpec<typeof reference> = {
  reference,
  entries: [
    {
      says: "closeOnEscape={false} keeps the Modal open on Escape",
      about: "prop closeOnEscape",
      fixture: modal({ closeOnEscape: false }),
      assert: async ({ root, update, user }) => {
        update({ onClose: () => update({ opened: false }) });
        await user.keyboard("{Escape}");
        expect(root.matches("[open]"), "open after Escape").toBe(true);
      },
      status: { until: "Modal 2", fails: "open after Escape: expected false to be true" },
      decision: "Q172",
    },
    {
      says: "zIndex={0} sets --mb-z-index to 0 on the Modal's root",
      about: "prop zIndex",
      fixture: modal({ zIndex: 0 }),
      assert: ({ root }) => {
        expect(getComputedStyle(root).getPropertyValue("--mb-z-index"), "--mb-z-index").toBe("0");
      },
      status: { until: "Modal 8", fails: "--mb-z-index: expected '' to be '0'" },
      decision: "Q173",
    },
    {
      says: "with no zIndex, --mb-z-index is set to the default layer",
      about: "variable --mb-z-index",
      fixture: modal(),
      assert: ({ root }) => {
        expect(getComputedStyle(root).getPropertyValue("--mb-z-index"), "--mb-z-index").not.toBe(
          "",
        );
      },
      status: { until: "Modal 8", fails: "--mb-z-index: expected '' not to be ''" },
      decision: "Q173",
    },
  ],
};
