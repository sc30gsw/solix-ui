import { createMemo, from } from "solid-js";
import { access } from "./internal-access";
import { createAttachment } from "./internal-attachment";
import { listen } from "./internal-listener";

export function createMisbehaving(options: { size: MaybeSize }, element: Element): () => number {
  const width = window.innerWidth;
  const read = createMemo(() => width, { ssrSource: "client" });
  const live = from<number>(() => () => undefined);
  const size = access(options.size);
  createAttachment(
    () => access(options.size),
    (current) => {
      const height = window.innerHeight + current + size;
      element.addEventListener("ping", () => height);
      return listen(element, "ping", () => undefined);
    },
  );
  const known = "document" in globalThis && globalThis.window !== undefined;
  const server = import.meta.env.SSR;
  try {
    element.getBoundingClientRect();
  } catch {
    element.remove();
  }
  const isElement = element instanceof Element;
  return () => (isElement && known && server && live ? read() : 0);
}

type MaybeSize = number | (() => number);
