export const stableClassPrefix = "solix-";

export function stableClass(component: string, part: string): string {
  return `${stableClassPrefix}${component}-${part}`;
}
