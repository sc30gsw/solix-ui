export function replaced(target: object, name: PropertyKey, value: unknown): () => void {
  const original = Object.getOwnPropertyDescriptor(target, name);
  Object.defineProperty(target, name, { configurable: true, writable: true, value });
  return () => {
    if (original) Object.defineProperty(target, name, original);
    else Reflect.deleteProperty(target, name);
  };
}

export function withoutGlobal<T>(name: string, run: () => T): T {
  const restore = replaced(globalThis, name, undefined);
  try {
    return run();
  } finally {
    restore();
  }
}
