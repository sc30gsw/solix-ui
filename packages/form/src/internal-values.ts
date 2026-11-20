export function isContainer(value: unknown): value is object {
  return typeof value === "object" && value !== null;
}

export function tagOf(value: unknown): string {
  return Object.prototype.toString.call(value);
}
