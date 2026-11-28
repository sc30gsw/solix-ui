import { expect } from "vite-plus/test";
import { modal } from "#/spec/fixtures.ts";
import type { FunctionSpec, Reference } from "#/spec/format.ts";

const reference = {
  props: ["zIndex"],
  parts: [],
  variables: ["--mb-z-index"],
  exports: [],
} as const satisfies Reference;

export const modalSpec: FunctionSpec<typeof reference> = {
  reference,
  entries: [
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
