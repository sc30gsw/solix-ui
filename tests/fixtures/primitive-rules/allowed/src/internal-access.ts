export function access<T>(value: T | (() => T)): T {
  return typeof value === "function" ? (value as () => T)() : value;
}

export function accessUntracked<T>(value: T | (() => T)): T {
  return access(value);
}
