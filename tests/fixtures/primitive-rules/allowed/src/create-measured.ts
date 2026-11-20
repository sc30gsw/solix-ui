import { createElementAttachment } from "#/packages/primitives/src/internal-attachment.ts";
import { type Listener, watchEvents } from "#/packages/primitives/src/internal-listener.ts";
import type { RefSetter } from "#/packages/primitives/src/types.ts";

function measureNow(element: HTMLElement): void {
  void element.scrollWidth;
}

function wire(target: HTMLElement, handlers: { scroll: Listener<Event> }): () => void {
  return watchEvents(target, ["scroll"], handlers.scroll);
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
      return () => {
        stop();
        stopBound();
        stopWired();
        stopIfGiven();
        stopOrQuiet();
        stopWhen();
        stopHeld();
        stopHolder();
        void element.getBoundingClientRect();
      };
    }),
    () => 0,
  ];
}
