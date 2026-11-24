import { hydratedMark } from "#/src/hydrated-mark.ts";

export const pageDidNotBecomeReady = "the page did not become ready";

export const hydrationTimeout = 10_000;

export function notReady(timeout: number, said: readonly string[], cause: unknown): Error {
  return new Error(
    `${pageDidNotBecomeReady}: its client script has not marked <html> with ${hydratedMark} within ${timeout} ms, so it has not hydrated the page. The page said: ${said.join(" | ") || "nothing"}`,
    { cause },
  );
}
