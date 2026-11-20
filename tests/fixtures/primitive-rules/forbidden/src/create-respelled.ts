import { createAttachment } from "#/packages/primitives/src/internal-attachment.ts";
import { browserMethod, lookUp } from "#/packages/primitives/src/internal-browser-api.ts";
import { observe } from "#/packages/primitives/src/internal-dom-observer.ts";
import { type Listener, watchEvents } from "#/packages/primitives/src/internal-listener.ts";
import {
  Field,
  Measurer,
  Runner,
  Sub,
  topOf,
  whenHeard,
} from "#/tests/fixtures/primitive-rules/forbidden/src/internal-position.ts";

type Sizer = { size: (target: HTMLElement) => number };

interface Measure {
  height(): number;
}

function visibilityOf(element: HTMLElement): boolean {
  return element.checkVisibility();
}

function shown(element: HTMLElement): boolean {
  return visibilityOf(element);
}

function handlerFor(top: number): () => number {
  return () => top;
}

function closureOver(element: HTMLElement): () => number {
  return () => element.offsetLeft;
}

function measuredTag(strings: TemplateStringsArray, element: HTMLElement): number {
  return strings.length + element.clientTop;
}

function notifyNow(heard: Listener<Event>): void {
  heard(new Event("now"));
}

function invoke<F extends (event: Event) => void>(fn: F): void {
  fn(new Event("now"));
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
    const reader = { size: (target: HTMLElement) => target.scrollWidth };
    const { size: destructured } = { size: (target: HTMLElement) => target.scrollHeight };
    const strategies = {
      top: (target: HTMLElement) => target.offsetTop,
      left: (target: HTMLElement) => target.clientLeft,
    };
    const listed = [(target: HTMLElement) => target.offsetParent];
    const withDefault = (read: () => unknown = () => window.pageXOffset) => read();
    const stored = closureOver(element);
    const setting = {
      set to(value: number) {
        void (value + window.pageYOffset);
      },
    };
    setting.to = 1;
    const typedHolder: Sizer = { size: (target) => target.scrollWidth + 1 };
    const typedTable: Record<"a" | "b", (target: HTMLElement) => number> = {
      a: (target) => target.offsetTop + 1,
      b: (target) => target.offsetLeft + 1,
    };
    const measure: Measure = { height: () => element.clientHeight + 1 };
    let reassigned: () => number = () => 0;
    if (element.isConnected) reassigned = () => element.scrollTop + 1;
    const written: { read?: () => number } = {};
    written.read = () => element.clientWidth + 1;
    const readers = [() => element.offsetHeight + 1, () => element.offsetWidth + 1];
    const iterated: number[] = [];
    for (const read of readers) iterated.push(read());
    const mapped = [() => element.scrollHeight + 1, () => element.scrollLeft + 1].map((read) => read());
    const heightBox = {
      get height() {
        return element.clientTop + 1;
      },
    };
    const { height } = heightBox;
    const spreadBox = {
      get width() {
        return element.clientLeft + 1;
      },
    };
    const spread = { ...spreadBox };
    const binder = { bind: (target: HTMLElement) => target.getClientRects().length + 1 };
    notifyNow(() => void element.scrollTop);
    invoke<Listener<Event>>(() => void (element.clientTop + 2));
    whenHeard(() => void (element.clientLeft + 2));
    const typedRuns = [
      typedHolder.size(element),
      typedTable.a(element),
      measure.height(),
      reassigned(),
      written.read(),
      iterated,
      mapped,
      height,
      spread,
      binder.bind(element),
      new Sub(element),
      new Field(element),
    ];
    const ran = [
      reader.size(element),
      destructured(element),
      strategies[element.dir === "rtl" ? "left" : "top"](element),
      listed[0](element),
      (element.isConnected ? () => document.scrollingElement?.scrollTop : () => 0)(),
      (0, () => element.ownerDocument.documentElement.clientWidth)(),
      withDefault(),
      stored(),
      new Promise<number>((resolve) => resolve(element.parentElement?.offsetHeight ?? 0)),
      new Runner(() => document.body.scrollLeft),
      measuredTag`${element}`,
    ];
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
      ran,
      typedRuns,
    ];
  });
}
