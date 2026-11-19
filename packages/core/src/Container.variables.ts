import { defineVariables } from "#/src/style-prop-table.ts";

export const containerVariables = defineVariables("Container", {
  "container-size": {
    kind: "length",
    scale: "container-size",
    responsive: false,
    children: [
      { when: '[data-strategy="grid"]', path: ["*"], set: () => ({ "grid-column": "2" }) },
      {
        when: '[data-strategy="grid"]',
        path: ["[data-breakout]"],
        set: () => ({ "grid-column": "1/-1" }),
      },
      {
        when: '[data-strategy="grid"]',
        path: ["[data-breakout]", "[data-container]"],
        set: (own) => ({ "max-width": own, "margin-inline": "auto" }),
      },
    ],
  },
});
