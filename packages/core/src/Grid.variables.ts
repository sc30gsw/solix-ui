import { defineVariables } from "#/src/style-prop-table.ts";

export const gridVariables = defineVariables("Grid", {
  "grid-align": { kind: "raw", responsive: false },
  "grid-column-gap": { kind: "length", scale: "spacing", responsive: true },
  "grid-gap": { kind: "length", scale: "spacing", responsive: true },
  "grid-justify": { kind: "raw", responsive: false },
  "grid-overflow": { kind: "raw", responsive: false },
  "grid-row-gap": { kind: "length", scale: "spacing", responsive: true },
});
