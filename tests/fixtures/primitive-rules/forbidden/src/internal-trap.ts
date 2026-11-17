import { focusQuietly } from "#/tests/fixtures/primitive-rules/forbidden/src/internal-focus.ts";

export function trap(target: HTMLElement): void {
  focusQuietly(target);
}
