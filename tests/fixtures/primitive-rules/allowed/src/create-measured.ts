import { createElementAttachment } from "#/packages/primitives/src/internal-attachment.ts";
import type { LiveConfig } from "#/packages/primitives/src/internal-equal.ts";
import { type Listener, watchEvents } from "#/packages/primitives/src/internal-listener.ts";
import type { RefSetter } from "#/packages/primitives/src/types.ts";

function measureNow(element: HTMLElement): void {
  void element.scrollWidth;
}

function wire(target: HTMLElement, handlers: { scroll: Listener<Event> }): () => void {
  return watchEvents(target, ["scroll"], handlers.scroll);
}

function wiredOn(target: HTMLElement, handlers: { scroll: Listener<Event> }): () => void {
  return wire(target, handlers);
}

function wiredIfGiven(target: HTMLElement, heard?: Listener<Event>): () => void {
  if (!heard) return () => undefined;
  return watchEvents(target, ["scroll"], heard);
}

function wiredOrQuiet(target: HTMLElement, heard: Listener<Event> | undefined): () => void {
  return watchEvents(target, ["scroll"], heard ?? (() => undefined));
}

function wiredWhen(target: HTMLElement, wanted: boolean, heard: Listener<Event>): () => void {
  return watchEvents(target, ["scroll"], wanted ? heard : () => undefined);
}

type Handlers = { now: () => number; onScroll: (event: Event) => void };

type Wired = { scroll: Listener<Event> };

function wiredReadonly(target: HTMLElement, handlers: Readonly<Wired>): () => void {
  return watchEvents(target, ["scroll"], handlers.scroll);
}

function wiredMixed(target: HTMLElement, handlers: Wired & { passive?: boolean }): () => void {
  return watchEvents(target, ["scroll"], handlers.scroll, { passive: handlers.passive });
}

function wiredAlso(target: HTMLElement, handlers: Wired): () => void {
  return wiredMixed(target, handlers);
}

class Destructured {
  wire(target: HTMLElement, handlers: Wired): () => void {
    const { scroll } = handlers;
    return watchEvents(target, ["scroll"], scroll);
  }
}

type FoldOptions<S> = { loadingValue: S; onSettle?: Listener<Event> };

interface SettleBase {
  onSettle?: Listener<Event>;
}

interface Settled extends SettleBase {
  loadingValue: number;
}

type Aliased = FoldOptions<number> & { passive?: boolean };

function fold<S>(target: HTMLElement, options: FoldOptions<S>): () => void;
function fold<S, C>(
  target: HTMLElement,
  options: FoldOptions<S> & { config: LiveConfig<C> },
): () => void;
function fold<S, C>(
  target: HTMLElement,
  options: FoldOptions<S> & { config?: LiveConfig<C> },
): () => void {
  void options.config;
  return watchEvents(target, ["scroll"], options.onSettle ?? (() => undefined));
}

function settledVia(target: HTMLElement, options: Settled): () => void {
  return watchEvents(target, ["scroll"], options.onSettle ?? (() => undefined));
}

function aliasedVia(target: HTMLElement, options: Aliased): () => void {
  return watchEvents(target, ["scroll"], options.onSettle ?? (() => undefined));
}

/** Holds what the rules allow. */
export function createMeasured(): [ref: RefSetter<HTMLElement>, width: () => number] {
  return [
    createElementAttachment<HTMLElement>((element) => {
      const onResize = () => void element.clientWidth;
      const stop = watchEvents(element, ["resize"], onResize);
      const stopBound = watchEvents(element, ["scroll"], measureNow.bind(null, element));
      const stopWired = wire(element, { scroll: () => void element.scrollHeight });
      const stopIfGiven = wiredIfGiven(element, () => void element.offsetTop);
      const stopOrQuiet = wiredOrQuiet(element, () => void element.offsetLeft);
      const stopWhen = wiredWhen(element, element.isConnected, () => void element.clientTop);
      const held = { scroll: () => void element.clientLeft };
      const stopHeld = wire(element, held);
      const holder: Handlers = { now: () => 1, onScroll: () => void element.offsetHeight };
      void holder.now();
      const stopHolder = watchEvents(element, ["scroll"], holder.onScroll);
      const stopOn = wiredOn(element, { scroll: () => void element.offsetWidth });
      const stopOther = watchEvents(element, ["scroll"], () => void element.scrollTop);
      element.dispatchEvent(new Event("settled"));
      const shaped = [
        wiredReadonly(element, { scroll: () => void element.clientHeight }),
        wiredMixed(element, { scroll: () => void element.scrollLeft, passive: true }),
        wiredAlso(element, { scroll: () => void element.offsetParent }),
        new Destructured().wire(element, { scroll: () => void element.scrollTop }),
        fold(element, { loadingValue: 0, onSettle: () => void element.offsetTop }),
        fold(element, { loadingValue: 0, config: () => 1, onSettle: () => void element.offsetLeft }),
        settledVia(element, { loadingValue: 0, onSettle: () => void element.clientTop }),
        aliasedVia(element, { loadingValue: 0, onSettle: () => void element.clientLeft }),
      ];
      return () => {
        stop();
        stopBound();
        stopWired();
        stopIfGiven();
        stopOrQuiet();
        stopWhen();
        stopHeld();
        stopHolder();
        stopOn();
        for (const stopShaped of shaped) stopShaped();
        stopOther();
        void element.getBoundingClientRect();
      };
    }),
    () => 0,
  ];
}
