import { createMemo, from } from "solid-js";
import { access } from "../../../../../packages/primitives/src/internal-access";
import { createAttachment } from "../../../../../packages/primitives/src/internal-attachment";
import { createBrowserValue } from "../../../../../packages/primitives/src/internal-browser-value";
import { listen } from "./internal-listener";

export function createMisbehaving(options: { size: MaybeSize }, element: HTMLElement): () => number {
  const width = window.innerWidth;
  const read = createMemo(() => width, { ssrSource: "client" });
  const live = from<number>(() => () => undefined);
  const size = access(options.size);
  createAttachment(
    (current) => {
      const height = window.innerHeight + current + size;
      element.addEventListener("ping", () => height);
      element.onfocus = () => height;
      Reflect.set(element, "onblur", () => height);
      return listen(element, "ping", () => undefined);
    },
    () => access(options.size),
  );
  const media = createBrowserValue<boolean>(
    (deliver) => deliver(window.matchMedia(String(access(options.size))).matches),
    { loadingValue: false },
  );
  const observer = new ResizeObserver(() => undefined);
  const Observer = browserApi(window, "MutationObserver");
  const viaWindow = new window.IntersectionObserver(() => undefined);
  const known = "document" in globalThis && Reflect.has(globalThis, "window");
  const server = import.meta.env.SSR;
  try {
    observer.observe(element);
  } catch {
    observer.disconnect();
  }
  const isElement = element instanceof Element;
  const later = window.setTimeout(() => undefined, 0);
  return () => (isElement && known && server && Observer && live && media() && viaWindow && later ? read() : 0);
}

type MaybeSize = number | (() => number);

function browserApi<O extends object, K extends keyof O>(owner: O, name: K): O[K] {
  return owner[name];
}
