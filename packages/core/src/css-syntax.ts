export const characterThatEndsADeclaration = /[;{}]/;

export function declarable<V>(value: V | null | undefined): V | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") return value;
  return value.trim() === "" || characterThatEndsADeclaration.test(value) ? undefined : value;
}

export function booleanAttribute(value: boolean | "" | null | undefined): boolean {
  return value === true || value === "";
}
