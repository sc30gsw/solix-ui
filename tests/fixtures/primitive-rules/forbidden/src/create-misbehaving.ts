import { access } from "./internal-access";
import { createAttachment } from "./internal-attachment";
import { listen } from "./internal-listener";

export function createMisbehaving(options: { size: MaybeSize }, element: Element): () => number {
  const size = access(options.size);
  createAttachment(
    () => access(options.size),
    (current) => {
      const height = current + size;
      element.addEventListener("ping", () => height);
      return listen(element, "ping", () => undefined);
    },
  );
  const isElement = element instanceof Element;
  return () => (isElement ? 1 : 0);
}

type MaybeSize = number | (() => number);
