export function moveFocus(target: HTMLElement): boolean {
  target.focus();
  return target.matches(":focus");
}

export function focusQuietly(target: HTMLElement): void {
  target.focus({ preventScroll: true });
}
