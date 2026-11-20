import { createAttachment } from "#/packages/primitives/src/internal-attachment.ts";
import { browserMethod, lookUp } from "#/packages/primitives/src/internal-browser-api.ts";
import { observe } from "#/packages/primitives/src/internal-dom-observer.ts";
import { watchEvents } from "#/packages/primitives/src/internal-listener.ts";
import { Measurer, topOf } from "#/tests/fixtures/primitive-rules/forbidden/src/internal-position.ts";

function visibilityOf(element: HTMLElement): boolean {
  return element.checkVisibility();
}

function shown(element: HTMLElement): boolean {
  return visibilityOf(element);
}

function handlerFor(top: number): () => number {
  return () => top;
}

/** Holds what the rules forbid. */
export function createRespelled(element: HTMLElement, listener: () => void): void {
  createAttachment(() => {
    element["focus"]();
    const { focus } = element;
    browserMethod(element, "focus")?.();
    Reflect.get(element, "focus");
    Reflect["get"](element, "focus");
    (0, Reflect.get)(element, "focus");
    const read = Reflect.get;
    read(element, "focus");
    const { get: bound } = Reflect;
    bound(element, "focus");
    const pick = <O extends object, K extends keyof O>(owner: O, name: K) => owner[name];
    pick(element, "focus");
    lookUp(...[element], "focus");
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
    const box = element.getBoundingClientRect();
    const { offsetWidth } = element;
    const top = lookUp(window, "scrollY");
    const style = getComputedStyle(element);
    const showing = shown(element);
    const stopWatching = watchEvents(window, ["scroll"], () => element.scrollTop + Number(shown(element)));
    const stopObserving = observe("ResizeObserver", element, undefined, () => element.clientWidth);
    const evaded = [
      watchEvents(window, ["scroll"], handlerFor(element.getClientRects().length)),
      observe("ResizeObserver", element, undefined, (void element.offsetHeight, () => undefined)),
      watchEvents(window, ["scroll"], ((kept: number) => () => kept)(element.scrollLeft)),
    ];
    const measured = [new Measurer(element).measure(), topOf(element)];
    const members = [
      document.createElementNS("http://www.w3.org/2000/svg", "rect").getBBox(),
      element.computedStyleMap(),
      document.elementFromPoint(0, 0),
      element.innerText,
      window.visualViewport,
      Object.getOwnPropertyDescriptor(Element.prototype, "clientHeight"),
    ];
    return () => [
      focus,
      stop,
      previous,
      onkeydown,
      handler,
      Found,
      Watcher,
      Named,
      box,
      offsetWidth,
      top,
      style,
      showing,
      stopWatching,
      stopObserving,
      evaded,
      measured,
      members,
    ];
  });
}
