import { browserApi } from "./internal-browser-api";
import { viewOf } from "./internal-node";

export const observerNames = Object.freeze([
  "IntersectionObserver",
  "MutationObserver",
  "ResizeObserver",
] as const);

type ObserverName = (typeof observerNames)[number];

type Kinds = {
  IntersectionObserver: { init: IntersectionObserverInit; entry: IntersectionObserverEntry };
  MutationObserver: { init: MutationObserverInit; entry: MutationRecord };
  ResizeObserver: { init: ResizeObserverOptions; entry: ResizeObserverEntry };
};

type Observer<N extends ObserverName> = {
  observe(target: Node, init?: Kinds[N]["init"]): void;
  disconnect(): void;
};

type ObserverClass<N extends ObserverName> = new (
  callback: (entries: Kinds[N]["entry"][], observer: Observer<N>) => void,
  init?: Kinds[N]["init"],
) => Observer<N>;

export function observe<N extends ObserverName>(
  name: N,
  target: Node,
  init: Kinds[N]["init"] | undefined,
  onEntries: (entries: Kinds[N]["entry"][], observer: Observer<N>) => void,
): () => void {
  const Observer = browserApi(viewOf(target), name) as ObserverClass<N> | undefined;
  if (!Observer) return () => undefined;
  const constructedWith = name === "IntersectionObserver";
  const observer = new Observer(onEntries, constructedWith ? init : undefined);
  observer.observe(target, constructedWith ? undefined : init);
  return () => observer.disconnect();
}
