/** Holds what the rules allow. */
export function getHotkeyHandler(hotkey: string): (event: KeyboardEvent) => boolean {
  return (event) => event.key === hotkey;
}
