export type Tab = 0 | 1 | 2 | 3;

export type Size = 2 | 3 | 4;

export const tabs: Tab[] = [0, 1, 2, 3];

export function tabAt(index: number): Tab {
  if (index === 0) return 0;
  if (index === 1) return 1;
  if (index === 2) return 2;
  if (index === 3) return 3;
  throw new Error("the roving list gave an index past the fourth tab");
}
