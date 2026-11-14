import axe from "axe-core";
import { expect } from "vite-plus/test";

const wcag22LevelAOrAA = /^wcag2\d?a{1,2}$/;

export const wcag22LevelAAndAA = [...new Set(axe.getRules().flatMap(({ tags }) => tags))]
  .filter((tag) => wcag22LevelAOrAA.test(tag))
  .sort();

export async function expectNoAxeViolations(region: Element): Promise<void> {
  expect(wcag22LevelAAndAA, "axe-core tags rules with WCAG 2.2 A and AA").toEqual(
    expect.arrayContaining(["wcag2a", "wcag2aa", "wcag22aa"]),
  );
  const results = await axe.run(region, {
    runOnly: { type: "tag", values: wcag22LevelAAndAA },
  });
  expect(
    results.violations.map(
      ({ id, help, nodes }) =>
        `${id}: ${help} (${nodes.map(({ target }) => target.join(" ")).join(", ")})`,
    ),
    "axe-core finds no WCAG 2.2 A or AA violation in the region",
  ).toEqual([]);
}
