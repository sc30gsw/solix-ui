export function moveFocus(target: HTMLElement): boolean {
  target.focus();
  return document.activeElement === target;
}

export function focusQuietly(target: HTMLElement): void {
  target.focus({ preventScroll: true });
}
