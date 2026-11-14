export function createValue<T>(initial: T) {
  return { get: () => initial };
}
