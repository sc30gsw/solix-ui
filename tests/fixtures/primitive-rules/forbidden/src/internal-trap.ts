import { focusQuietly } from "./internal-focus";

export function trap(target: HTMLElement): void {
  focusQuietly(target);
}
