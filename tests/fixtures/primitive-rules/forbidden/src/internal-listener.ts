export function listen(target: EventTarget, type: string, listener: () => void): () => void {
  target.addEventListener(type, listener);
  return () => target.removeEventListener(type, listener);
}
