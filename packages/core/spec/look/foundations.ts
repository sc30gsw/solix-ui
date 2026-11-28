import { fixture, looks, tabs } from "#/spec/fixtures.ts";
import type { LookSpec } from "#/spec/format.ts";
import { statuses, visualReference } from "#/spec/look/reference.ts";

const field = fixture("TextInput", { "aria-label": "Name" });
const disabledField = fixture("TextInput", { "aria-label": "Name", disabled: true });
const firstTab = { at: { of: "TabsTab", part: "root" } } as const;
const disabledFirstTab = tabs({ root: { defaultValue: "b" }, firstTab: { disabled: true } });

const focused = { state: "focus-visible" } as const;

export const foundationsLook: LookSpec = [
  looks(field, "outline-style", "solid", "foundations 16", focused),
  looks(field, "outline-width", statuses.focusRingWidth, "foundations 16", focused),
  looks(field, "outline-color", visualReference.light.accent, "foundations 16", focused),
  looks(tabs(), "outline-style", "solid", undefined, { ...firstTab, ...focused }),
  looks(tabs(), "outline-width", statuses.focusRingWidth, undefined, { ...firstTab, ...focused }),
  looks(tabs(), "outline-offset", statuses.focusRingOffset, undefined, {
    ...firstTab,
    ...focused,
  }),
  looks(disabledField, "opacity", statuses.disabledOpacity, "foundations 17"),
  looks(disabledField, "cursor", "not-allowed"),
  looks(disabledField, "pointer-events", "none", "foundations 17"),
  looks(disabledFirstTab, "opacity", statuses.disabledOpacity, "foundations 17", firstTab),
  looks(disabledFirstTab, "cursor", "not-allowed", undefined, firstTab),
  looks(tabs(), "transition-property", "none", undefined, {
    ...firstTab,
    media: { reducedMotion: true },
  }),
];
