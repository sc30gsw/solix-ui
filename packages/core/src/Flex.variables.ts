import { defineVariables } from "#/src/style-prop-table.ts";

export const flexVariables = defineVariables("Flex", {
  "flex-align": { kind: "raw", responsive: true },
  "flex-column-gap": { kind: "length", scale: "spacing", responsive: true },
  "flex-direction": { kind: "raw", responsive: true },
  "flex-gap": { kind: "length", scale: "spacing", responsive: true },
  "flex-justify": { kind: "raw", responsive: true },
  "flex-row-gap": { kind: "length", scale: "spacing", responsive: true },
  "flex-wrap": { kind: "raw", responsive: true },
});
