import { createAttachment } from "./internal-attachment";
import { handleEvent } from "./internal-listener";

/**
 * Calls `onPageLeave` when the pointer leaves the page, on `mouseleave` of the document element,
 * as an exit-intent prompt needs. The listener is added once the owner's effects run, never on the
 * server, and removed when the owner is disposed.
 *
 * ```ts
 * createPageLeave(() => setOffered(true));
 * ```
 */
export function createPageLeave(onPageLeave: () => void): void {
  createAttachment(() => handleEvent(document.documentElement, "mouseleave", () => onPageLeave()));
}
