import { defineVariables } from "#/src/variables.ts";

export const stackVariables = defineVariables("Stack", {
  "stack-align": { kind: "raw", responsive: false },
  "stack-gap": { kind: "length", scale: "spacing", responsive: false },
  "stack-justify": { kind: "raw", responsive: false },
});
