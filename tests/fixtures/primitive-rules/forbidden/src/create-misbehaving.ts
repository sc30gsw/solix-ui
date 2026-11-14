export function createMisbehaving(options: { size: MaybeSize }, element: Element): () => number {
  const isElement = element instanceof Element;
  return () => (isElement ? 1 : 0);
}

type MaybeSize = number | (() => number);
