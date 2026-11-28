export function indexOfFocused(items: readonly HTMLElement[]): number {
  return items.findIndex((item) => item === document.activeElement);
}
