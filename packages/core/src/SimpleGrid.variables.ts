import { defineVariables } from "#/src/style-prop-table.ts";

export const simpleGridVariables = defineVariables("SimpleGrid", {
  "sg-auto-rows": { kind: "raw", responsive: false },
  "sg-cols": { kind: "raw", responsive: true },
  "sg-min-col-width": { kind: "length", responsive: false },
  "sg-spacing-x": { kind: "length", scale: "spacing", responsive: true },
  "sg-spacing-y": { kind: "length", scale: "spacing", responsive: true },
});
