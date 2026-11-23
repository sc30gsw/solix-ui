import { expect } from "vite-plus/test";
import { fixture } from "#/spec/fixtures.ts";
import { defineReference, defineSpec, dom } from "#/spec/format.ts";

const reference = defineReference({
  props: ["description", "error"],
  parts: [],
  variables: [],
});

export const spec = defineSpec(reference, [
  {
    says: "description and error are shown together",
    promise: { kind: "prop", prop: "error" },
    check: dom(
      fixture("TextInput", { description: "Helps", error: "Wrong", "aria-label": "Name" }),
      ({ container }) => {
        expect(container.textContent, "the field's text").toContain("Helps");
        expect(container.textContent, "the field's text").toContain("Wrong");
      },
    ),
    status: "pending",
    until: "TextInput 2",
    failsWith: "the field's text: expected '' to contain 'Helps'",
    decision: "Q177",
  },
]);
