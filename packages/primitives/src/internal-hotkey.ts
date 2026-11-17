import type { HotkeyItem } from "#/src/types.ts";

export type ParsedHotkey = {
  readonly alt: boolean;
  readonly ctrl: boolean;
  readonly meta: boolean;
  readonly shift: boolean;
  readonly mod: boolean;
  readonly key: string | undefined;
};

export type KeyChord = Pick<
  KeyboardEvent,
  "key" | "code" | "altKey" | "ctrlKey" | "metaKey" | "shiftKey"
>;

const keyNames: Readonly<Record<string, string>> = Object.freeze({
  " ": "space",
  spacebar: "space",
  "+": "plus",
  "[plus]": "plus",
  "-": "minus",
  "*": "asterisk",
  "/": "slash",
  esc: "escape",
  up: "arrowup",
  down: "arrowdown",
  left: "arrowleft",
  right: "arrowright",
});

const modifierNames = ["alt", "ctrl", "meta", "shift", "mod"] as const;

const plusKey = "[plus]";
const plusPlaceholder = "\u0000";
const letterCode = "Key";
const digitCode = "Digit";
const composingKeyCode = 229;

export function keyName(key: string): string {
  const lower = key.toLowerCase();
  return keyNames[lower] ?? lower;
}

export function codeName(code: string): string {
  if (code.startsWith(letterCode) && code.length === letterCode.length + 1) {
    return code.slice(letterCode.length).toLowerCase();
  }
  if (code.startsWith(digitCode) && code.length === digitCode.length + 1) {
    return code.slice(digitCode.length);
  }
  return keyName(code);
}

export function parseHotkey(hotkey: string): ParsedHotkey {
  const parts = hotkey
    .toLowerCase()
    .split(plusKey)
    .join(plusPlaceholder)
    .split("+")
    .map((part) => part.trim().split(plusPlaceholder).join(plusKey))
    .filter((part) => part !== "");
  const modifiers = new Set(parts.filter((part) => modifierNames.some((name) => name === part)));
  const keys = parts.filter((part) => !modifierNames.some((name) => name === part));
  return {
    alt: modifiers.has("alt"),
    ctrl: modifiers.has("ctrl"),
    meta: modifiers.has("meta"),
    shift: modifiers.has("shift"),
    mod: modifiers.has("mod"),
    key: keys.length === 1 ? keyName(keys[0]) : undefined,
  };
}

export function matchesHotkey(
  hotkey: ParsedHotkey,
  chord: KeyChord,
  usePhysicalKeys: boolean,
): boolean {
  if (hotkey.key === undefined) return false;
  if (hotkey.alt !== chord.altKey || hotkey.shift !== chord.shiftKey) return false;
  if (hotkey.mod) {
    if (!chord.ctrlKey && !chord.metaKey) return false;
  } else if (hotkey.ctrl !== chord.ctrlKey || hotkey.meta !== chord.metaKey) {
    return false;
  }
  const pressed = usePhysicalKeys ? codeName(chord.code) : keyName(chord.key);
  return pressed === hotkey.key;
}

export function isComposing(event: Pick<KeyboardEvent, "isComposing" | "keyCode">): boolean {
  return event.isComposing || event.keyCode === composingKeyCode;
}

export function runHotkeys(event: KeyboardEvent, items: readonly HotkeyItem[]): void {
  if (event.defaultPrevented || isComposing(event)) return;
  for (const [hotkey, handler, options] of items) {
    if (!matchesHotkey(parseHotkey(hotkey), event, options?.usePhysicalKeys ?? false)) continue;
    if (options?.preventDefault ?? true) event.preventDefault();
    handler(event);
  }
}
