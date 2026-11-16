import { onCleanup } from "solid-js";
import { expect, onTestFinished, test } from "vite-plus/test";
import { userEvent } from "vite-plus/test/browser";
import { watchEvents } from "../src/internal-listener";
import { mount, record } from "./support/browser-harness";
import { box, button, witnessed } from "./support/dom";
import { tallPage } from "./support/scroll";

const ping = "solix-ping";

type Watched = { target: EventTarget; descendant: EventTarget };

function watched(target: EventTarget, type: string): Event[] {
  const seen: Event[] = [];
  mount(() => onCleanup(watchEvents(target, [type], (event: Event) => seen.push(event))));
  return seen;
}

function stoppingPropagation(node: EventTarget, type: string): void {
  const stopped = new AbortController();
  node.addEventListener(type, (event) => event.stopPropagation(), {
    capture: true,
    signal: stopped.signal,
  });
  onTestFinished(() => stopped.abort());
}

function inShadowRoot(): Watched {
  const host = box("host");
  const root = host.attachShadow({ mode: "open" });
  return { target: host, descendant: button("inner", root) };
}

const targets: { on: string; arrange: () => Watched }[] = [
  {
    on: "an element",
    arrange: () => {
      const element = box("watched");
      return { target: element, descendant: button("inner", element) };
    },
  },
  { on: "a shadow host", arrange: inShadowRoot },
  { on: "a document", arrange: () => ({ target: document, descendant: button("inner") }) },
  { on: "a window", arrange: () => ({ target: window, descendant: button("inner") }) },
  { on: "a window, for its document", arrange: () => ({ target: window, descendant: document }) },
];

const dispatches = [
  { event: "an event that bubbles, aimed at the target", bubbles: true, atTarget: true },
  { event: "an event that bubbles, aimed at a descendant", bubbles: true, atTarget: false },
  { event: "an event that does not bubble, aimed at the target", bubbles: false, atTarget: true },
  {
    event: "an event that does not bubble, aimed at a descendant",
    bubbles: false,
    atTarget: false,
  },
];

const synthetic = targets.flatMap((target) =>
  dispatches.map((dispatch) => ({ ...target, ...dispatch })),
);

test.each(synthetic)(
  "watchEvents on $on sees $event exactly when a bubble-phase listener there would, and still sees it when a descendant stops its propagation",
  ({ arrange, bubbles, atTarget }) => {
    const { target, descendant } = arrange();
    const control = record(target, ping);
    const seen = watched(target, ping);
    const send = () =>
      (atTarget ? target : descendant).dispatchEvent(new Event(ping, { bubbles, composed: true }));

    send();
    const unstopped = { control: control.length, seen: seen.length };
    stoppingPropagation(descendant, ping);
    send();
    expect({ unstopped: unstopped.seen, stopped: seen.length - unstopped.seen }).toEqual({
      unstopped: unstopped.control,
      stopped: unstopped.control,
    });
  },
);

test("the synthetic cases hold both an event a bubble-phase listener receives and one it does not, and a stop that hides one from it", () => {
  const delivered = synthetic.map(({ arrange, bubbles, atTarget }) => {
    const { target, descendant } = arrange();
    const control = record(target, ping);
    const send = () =>
      (atTarget ? target : descendant).dispatchEvent(new Event(ping, { bubbles, composed: true }));
    send();
    const unstopped = control.length;
    stoppingPropagation(descendant, ping);
    send();
    return `${unstopped} then ${control.length - unstopped}`;
  });

  expect(new Set(delivered)).toEqual(new Set(["1 then 1", "1 then 0", "0 then 0"]));
});

type Real = {
  target: EventTarget;
  aimedAt: EventTarget;
  act: () => void | Promise<void>;
  undo: () => void | Promise<void>;
};

function focusable(): { element: HTMLDivElement; inner: HTMLButtonElement } {
  const element = box("watched");
  element.tabIndex = -1;
  return { element, inner: button("inner", element) };
}

const real: { event: string; type: string; delivered: number; arrange: () => Real }[] = [
  {
    event: "a click on a descendant, which bubbles",
    type: "click",
    delivered: 1,
    arrange: () => {
      const { element, inner } = focusable();
      return {
        target: element,
        aimedAt: inner,
        act: () => userEvent.click(inner),
        undo: () => undefined,
      };
    },
  },
  {
    event: "the focusin of a descendant, which bubbles",
    type: "focusin",
    delivered: 1,
    arrange: () => {
      const { element, inner } = focusable();
      return {
        target: element,
        aimedAt: inner,
        act: () => inner.focus(),
        undo: () => inner.blur(),
      };
    },
  },
  {
    event: "the focus of a descendant, which does not bubble",
    type: "focus",
    delivered: 0,
    arrange: () => {
      const { element, inner } = focusable();
      return {
        target: element,
        aimedAt: inner,
        act: () => inner.focus(),
        undo: () => inner.blur(),
      };
    },
  },
  {
    event: "the element's own focus, which does not bubble",
    type: "focus",
    delivered: 1,
    arrange: () => {
      const { element } = focusable();
      return {
        target: element,
        aimedAt: element,
        act: () => element.focus(),
        undo: () => element.blur(),
      };
    },
  },
  {
    event: "the mouseenter of a descendant, which does not bubble",
    type: "mouseenter",
    delivered: 0,
    arrange: () => {
      const { element, inner } = focusable();
      const away = box("away");
      return {
        target: element,
        aimedAt: inner,
        act: () => userEvent.hover(inner),
        undo: () => userEvent.hover(away),
      };
    },
  },
  {
    event: "the element's own mouseenter, as the pointer enters a descendant",
    type: "mouseenter",
    delivered: 1,
    arrange: () => {
      const { element, inner } = focusable();
      const away = box("away");
      return {
        target: element,
        aimedAt: element,
        act: () => userEvent.hover(inner),
        undo: () => userEvent.hover(away),
      };
    },
  },
  {
    event: "a scroll of the page, which bubbles from the document to the window",
    type: "scroll",
    delivered: 1,
    arrange: () => {
      tallPage();
      onTestFinished(() => window.scrollTo(0, 0));
      return {
        target: window,
        aimedAt: document,
        act: () => window.scrollBy(0, 100),
        undo: () => undefined,
      };
    },
  },
  {
    event: "a scroll of an element inside the page, seen from the window, which does not bubble",
    type: "scroll",
    delivered: 0,
    arrange: () => {
      const scroller = box("scroller");
      scroller.style.height = "50px";
      scroller.style.overflow = "auto";
      box("tall", scroller).style.height = "500px";
      return {
        target: window,
        aimedAt: scroller,
        act: () => scroller.scrollBy(0, 20),
        undo: () => undefined,
      };
    },
  },
];

test.each(real)(
  "watchEvents sees $event, exactly when a bubble-phase listener would, and still when it is stopped at the node it is aimed at",
  async ({ type, delivered, arrange }) => {
    const { target, aimedAt, act, undo } = arrange();
    await undo();
    const aimed = (events: readonly Event[]) =>
      events.filter((event) => event.target === aimedAt).length;
    const sent = record(aimedAt, type, true);
    const control = record(target, type);
    const seen = watched(target, type);
    const acted = async () => {
      const before = { sent: aimed(sent), control: aimed(control), seen: aimed(seen) };
      await act();
      await witnessed(sent, () => aimed(sent) > before.sent, `the ${type}`);
      return { control: aimed(control) - before.control, seen: aimed(seen) - before.seen };
    };

    const unstopped = await acted();
    await undo();
    stoppingPropagation(aimedAt, type);
    const stopped = await acted();
    expect({
      control: unstopped.control,
      unstopped: unstopped.seen,
      stopped: stopped.seen,
    }).toEqual({ control: delivered, unstopped: delivered, stopped: delivered });
  },
);
