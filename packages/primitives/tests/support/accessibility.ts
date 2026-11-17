import axe from "axe-core";
import { expect } from "vite-plus/test";
import { wcag2AAndAATags } from "../../../../tests/support/browser-gates.ts";

export async function expectNoAxeViolations(region: Element): Promise<void> {
  expect(wcag2AAndAATags, "axe-core tags rules with WCAG 2.2 A and AA").toEqual(
    expect.arrayContaining(["wcag2a", "wcag2aa", "wcag22aa"]),
  );
  const results = await axe.run(region, {
    runOnly: { type: "tag", values: wcag2AAndAATags },
  });
  expect(
    results.violations.map(
      ({ id, help, nodes }) =>
        `${id}: ${help} (${nodes.map(({ target }) => target.join(" ")).join(", ")})`,
    ),
    "axe-core finds no WCAG 2.2 A or AA violation in the region",
  ).toEqual([]);
}
