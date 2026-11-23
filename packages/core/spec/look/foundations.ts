import { fixture, tabs } from "#/spec/fixtures.ts";
import { defineLook, lookEntry, style } from "#/spec/format.ts";
import { statuses, visualReference } from "#/spec/look/reference.ts";

const field = fixture("TextInput", { "aria-label": "Name" });
const disabledField = fixture("TextInput", { "aria-label": "Name", disabled: true });
const firstTab = { at: { of: "TabsTab", part: "root" } } as const;
const disabledFirstTab = tabs({ root: { defaultValue: "b" }, firstTab: { disabled: true } });

export const look = defineLook([
  lookEntry(style(field, "outline-style", "solid", { state: "focus-visible" }), {
    until: "foundations 16",
  }),
  lookEntry(style(field, "outline-width", statuses.focusRingWidth, { state: "focus-visible" }), {
    until: "foundations 16",
  }),
  lookEntry(
    style(field, "outline-color", visualReference.light.accent, { state: "focus-visible" }),
    { until: "foundations 16" },
  ),
  lookEntry(style(tabs(), "outline-style", "solid", { ...firstTab, state: "focus-visible" })),
  lookEntry(
    style(tabs(), "outline-width", statuses.focusRingWidth, {
      ...firstTab,
      state: "focus-visible",
    }),
  ),
  lookEntry(
    style(tabs(), "outline-offset", statuses.focusRingOffset, {
      ...firstTab,
      state: "focus-visible",
    }),
  ),
  lookEntry(style(disabledField, "opacity", statuses.disabledOpacity), { until: "foundations 17" }),
  lookEntry(style(disabledField, "cursor", "not-allowed")),
  lookEntry(style(disabledField, "pointer-events", "none"), { until: "foundations 17" }),
  lookEntry(style(disabledFirstTab, "opacity", statuses.disabledOpacity, firstTab), {
    until: "foundations 17",
  }),
  lookEntry(style(disabledFirstTab, "cursor", "not-allowed", firstTab)),
  lookEntry(
    style(tabs(), "transition-property", "none", { ...firstTab, media: { reducedMotion: true } }),
  ),
]);
