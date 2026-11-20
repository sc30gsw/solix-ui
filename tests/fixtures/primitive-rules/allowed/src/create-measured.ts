import { createElementAttachment } from "#/packages/primitives/src/internal-attachment.ts";
import { type Listener, watchEvents } from "#/packages/primitives/src/internal-listener.ts";
import type { RefSetter } from "#/packages/primitives/src/types.ts";

function measureNow(element: HTMLElement): void {
  void element.scrollWidth;
}

function wire(target: HTMLElement, handlers: { scroll: Listener<Event> }): () => void {
  return watchEvents(target, ["scroll"], handlers.scroll);
}

function deferred(heard: Listener<Event>): Listener<Event> {
  return (event) => heard(event);
}

/** Holds what the rules allow. */
export function createMeasured(): [ref: RefSetter<HTMLElement>, width: () => number] {
  return [
    createElementAttachment<HTMLElement>((element) => {
      const onResize = () => void element.clientWidth;
      const stop = watchEvents(element, ["resize"], onResize);
      const stopBound = watchEvents(element, ["scroll"], measureNow.bind(null, element));
      const stopWired = wire(element, { scroll: () => void element.scrollHeight });
      const stopDeferred = watchEvents(element, ["scroll"], deferred(() => void element.scrollLeft));
      return () => {
        stop();
        stopBound();
        stopWired();
        stopDeferred();
        void element.getBoundingClientRect();
      };
    }),
    () => 0,
  ];
}
