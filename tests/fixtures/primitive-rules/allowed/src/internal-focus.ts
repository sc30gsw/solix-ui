export function moveFocus(target: HTMLElement): boolean {
  target.focus();
  return document.activeElement === target;
}
