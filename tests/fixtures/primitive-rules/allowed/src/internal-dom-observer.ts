export function observe(target: Node, onRecords: () => void): () => void {
  const observer = new MutationObserver(onRecords);
  observer.observe(target, { childList: true });
  return () => observer.disconnect();
}
