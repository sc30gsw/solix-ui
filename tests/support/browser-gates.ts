import axe from "axe-core";

const wcag2AAndAATagPattern = /^wcag2\d?a{1,2}$/;

export const wcag2AAndAATags = [...new Set(axe.getRules().flatMap(({ tags }) => tags))]
  .filter((tag) => wcag2AAndAATagPattern.test(tag))
  .sort();

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
