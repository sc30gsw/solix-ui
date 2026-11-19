import { defineVariables } from "#/src/variables.ts";

export const groupVariables = defineVariables("Group", {
  "group-align": { kind: "raw", responsive: false },
  "group-child-width": {
    kind: "raw",
    responsive: false,
    children: [{ path: ["*"], set: (own) => ({ "flex-grow": "1", "max-width": own }) }],
  },
  "group-gap": { kind: "length", scale: "spacing", responsive: false },
  "group-justify": { kind: "raw", responsive: false },
  "group-wrap": { kind: "raw", responsive: false },
});
