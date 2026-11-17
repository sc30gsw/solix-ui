import axe from "axe-core";
import { OBSERVE } from "solid-js";

const wcag2AAndAATagPattern = /^wcag2\d?a{1,2}$/;

export const wcag2AAndAATags = [...new Set(axe.getRules().flatMap(({ tags }) => tags))]
  .filter((tag) => wcag2AAndAATagPattern.test(tag))
  .sort();

export function solidDevelopmentBuildLoaded(): boolean {
  return OBSERVE !== undefined;
}

export function captureSolidDiagnostics(): () => string[] {
  const capture = OBSERVE?.diagnostics.capture();
  return () =>
    (capture?.stop() ?? []).map(({ code, message }) => `${code}: ${message.split("\n")[0]}`);
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
