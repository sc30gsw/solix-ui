import { defineVariables } from "#/src/variables.ts";

export const buttonVariables = defineVariables("Button", {
  "button-fz": { kind: "length", scale: "font-size", responsive: false },
  "button-height": { kind: "length", scale: "control-height", responsive: false },
  "button-padding-x": { kind: "length", scale: "control-padding", responsive: false },
  "button-radius": { kind: "length", scale: "radius", responsive: false },
});
