import { expect } from "vite-plus/test";
import { unbuilt } from "#/spec/fixtures.ts";
import type { FunctionSpec, Reference } from "#/spec/format.ts";

const reference = {
  props: ["error"],
  parts: [],
  variables: [],
  exports: [],
} as const satisfies Reference;

export const textInputSpec: FunctionSpec<typeof reference> = {
  reference,
  entries: [
    {
      says: "description and error are shown together",
      about: "prop error",
      fixture: unbuilt("TextInput", { description: "Helps", error: "Wrong", "aria-label": "Name" }),
      assert: ({ container }) => {
        expect(container.textContent, "the field's text").toContain("Helps");
        expect(container.textContent, "the field's text").toContain("Wrong");
      },
      status: { until: "TextInput 2", fails: "the field's text: expected '' to contain 'Helps'" },
      decision: "Q177",
    },
  ],
};
