import { defineVariables } from "#/src/style-prop-table.ts";

export const spaceVariables = defineVariables("Space", {
  "space-min-height": { kind: "length", scale: "spacing", responsive: true },
  "space-min-width": { kind: "length", scale: "spacing", responsive: true },
});
