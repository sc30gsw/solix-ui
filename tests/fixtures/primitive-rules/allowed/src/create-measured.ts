import { createElementAttachment } from "#/packages/primitives/src/internal-attachment.ts";
import { watchEvents } from "#/packages/primitives/src/internal-listener.ts";
import type { RefSetter } from "#/packages/primitives/src/types.ts";

function measureNow(element: HTMLElement): void {
  void element.scrollWidth;
}

/** Holds what the rules allow. */
export function createMeasured(): [ref: RefSetter<HTMLElement>, width: () => number] {
  return [
    createElementAttachment<HTMLElement>((element) => {
      const onResize = () => void element.clientWidth;
      const stop = watchEvents(element, ["resize"], onResize);
      const stopBound = watchEvents(element, ["scroll"], measureNow.bind(null, element));
      return () => {
        stop();
        stopBound();
        void element.getBoundingClientRect();
      };
    }),
    () => 0,
  ];
}
