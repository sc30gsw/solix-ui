export function createScrollFold<S>(start: () => S): () => S {
  return start;
}
