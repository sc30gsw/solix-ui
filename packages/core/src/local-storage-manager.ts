import { isServer } from "@solidjs/web";
import { isColorScheme, type SolixColorSchemeManager } from "#/src/color-scheme-manager.ts";

export type LocalStorageColorSchemeManagerOptions = { key?: string };

export const colorSchemeStorageKey = "solix-color-scheme-value";

function storage(): Storage | undefined {
  try {
    return isServer ? undefined : globalThis.localStorage;
  } catch {
    return undefined;
  }
}

function attempt(action: () => void): void {
  try {
    action();
  } catch {}
}

export function localStorageColorSchemeManager({
  key = colorSchemeStorageKey,
}: LocalStorageColorSchemeManagerOptions = {}): SolixColorSchemeManager {
  let stopListening = () => {};
  return {
    get: (fallback) => {
      try {
        const stored = storage()?.getItem(key);
        return isColorScheme(stored) ? stored : fallback;
      } catch {
        return fallback;
      }
    },
    set: (value) => attempt(() => storage()?.setItem(key, value)),
    subscribe: (onUpdate) => {
      if (isServer) return;
      stopListening();
      const listener = (event: StorageEvent) => {
        if (event.key === key && event.storageArea === storage() && isColorScheme(event.newValue)) {
          onUpdate(event.newValue);
        }
      };
      globalThis.addEventListener("storage", listener);
      stopListening = () => globalThis.removeEventListener("storage", listener);
    },
    unsubscribe: () => {
      stopListening();
      stopListening = () => {};
    },
    clear: () => attempt(() => storage()?.removeItem(key)),
  };
}
