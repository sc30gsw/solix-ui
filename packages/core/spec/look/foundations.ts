import { defineLook, type Fixture, style } from "#/spec/format.ts";

const accent = "oklch(0.6204 0.195 253.83)";

const field: Fixture = { component: "TextInput", props: { "aria-label": "Name" } };
const disabledField: Fixture = { ...field, props: { ...field.props, disabled: true } };

function tabs(tabProps: Fixture["props"], selected = "a"): Fixture {
  return {
    component: "Tabs",
    props: { defaultValue: selected },
    children: [
      {
        component: "TabsList",
        props: { "aria-label": "Sections" },
        children: [
          { component: "TabsTab", props: { value: "a", ...tabProps }, children: "A" },
          { component: "TabsTab", props: { value: "b" }, children: "B" },
        ],
      },
    ],
  };
}

export const spec = defineLook("foundations", [
  {
    says: "a field's focus ring is 2px wide",
    promise: { kind: "look", property: "outline-width" },
    check: style(field, "outline-width", "2px", { state: "focus-visible" }),
    status: "pending",
    until: "foundations 16",
  },
  {
    says: "a field's focus ring sits against it, with no offset",
    promise: { kind: "look", property: "outline-offset" },
    check: style(field, "outline-offset", "0px", { state: "focus-visible" }),
    status: "holds",
  },
  {
    says: "a field's focus ring is in the focus colour",
    promise: { kind: "look", property: "outline-color" },
    check: style(field, "outline-color", accent, { state: "focus-visible" }),
    status: "pending",
    until: "foundations 16",
  },
  {
    says: "a tab's focus ring is 2px wide",
    promise: { kind: "look", property: "outline" },
    check: style(tabs({}), "outline-width", "2px", {
      of: "TabsTab",
      state: "focus-visible",
    }),
    status: "holds",
  },
  {
    says: "a tab's focus ring is 2px off the tab",
    promise: { kind: "look", property: "outline-offset" },
    check: style(tabs({}), "outline-offset", "2px", { of: "TabsTab", state: "focus-visible" }),
    status: "holds",
  },
  {
    says: "a disabled field is at half opacity",
    promise: { kind: "look", property: "opacity" },
    check: style(disabledField, "opacity", "0.5"),
    status: "pending",
    until: "foundations 17",
  },
  {
    says: "a disabled field shows the not-allowed cursor",
    promise: { kind: "look", property: "cursor" },
    check: style(disabledField, "cursor", "not-allowed"),
    status: "holds",
  },
  {
    says: "a disabled field takes no pointer events",
    promise: { kind: "look", property: "pointer-events" },
    check: style(disabledField, "pointer-events", "none"),
    status: "pending",
    until: "foundations 17",
  },
  {
    says: "a disabled tab is at half opacity",
    promise: { kind: "look", property: "opacity" },
    check: style(tabs({ disabled: true }, "b"), "opacity", "0.5", { of: "TabsTab" }),
    status: "pending",
    until: "foundations 17",
  },
  {
    says: "a disabled tab shows the not-allowed cursor",
    promise: { kind: "look", property: "cursor" },
    check: style(tabs({ disabled: true }, "b"), "cursor", "not-allowed", { of: "TabsTab" }),
    status: "holds",
  },
  {
    says: "a tab runs no transition under reduced motion",
    promise: { kind: "look", property: "transition-property" },
    check: style(tabs({}), "transition-property", "none", {
      of: "TabsTab",
      state: "reduced-motion",
    }),
    status: "holds",
  },
]);
