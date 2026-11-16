import { createAttachment } from "../../../../../packages/primitives/src/internal-attachment";
import { browserMethod, lookUp } from "../../../../../packages/primitives/src/internal-browser-api";

/** Holds what the rules forbid. */
export function createRespelled(element: HTMLElement, listener: () => void): void {
  createAttachment(() => {
    element["focus"]();
    const { focus } = element;
    browserMethod(element, "focus")?.();
    Reflect.get(element, "focus");
    Reflect.apply(element.focus, element, []);
    browserMethod(window, "addEventListener")?.("resize", listener);
    const { removeEventListener: stop } = window;
    window["addEventListener"]("resize", listener);
    const previous = lookUp(element, "onclick");
    const { onkeydown } = element;
    const handler = element["onkeyup"];
    const Found = lookUp(window, "ResizeObserver");
    const { MutationObserver: Watcher } = window;
    const Named = window["IntersectionObserver"];
    return () => [focus, stop, previous, onkeydown, handler, Found, Watcher, Named];
  });
}
