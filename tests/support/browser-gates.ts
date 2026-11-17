import axe from "axe-core";
import { OBSERVE } from "solid-js";

const wcag2ATagPattern = /^wcag2\d?a{1,2}$/;

export const wcag2ATags = [...new Set(axe.getRules().flatMap(({ tags }) => tags))]
  .filter((tag) => wcag2ATagPattern.test(tag))
  .sort();

export function solidDevelopmentBuildLoaded(): boolean {
  return OBSERVE !== undefined;
}

export function captureSolidDiagnostics(): () => string[] {
  const capture = OBSERVE?.diagnostics.capture();
  return () =>
    (capture?.stop() ?? []).map(({ code, message }) => `${code}: ${message.split("\n")[0]}`);
}
