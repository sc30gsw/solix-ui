export function createStateCommand(run: () => void, idle: () => void): () => void {
  return run ?? idle;
}

export function createBrowserCommand(run: () => void, idle: () => void): () => void {
  return run ?? idle;
}
