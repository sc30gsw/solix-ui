import axe from "axe-core";

export const wcag22LevelAAndAA = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] as const;

export async function axeViolations(region: Element): Promise<string[]> {
  const results = await axe.run(region, {
    runOnly: { type: "tag", values: [...wcag22LevelAAndAA] },
  });
  return results.violations.map(
    ({ id, help, nodes }) =>
      `${id}: ${help} (${nodes.map(({ target }) => target.join(" ")).join(", ")})`,
  );
}
