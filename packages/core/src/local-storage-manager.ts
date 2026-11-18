import { isServer } from "@solidjs/web";
import type { SolixColorSchemeManager } from "#/src/color-scheme-manager.ts";
import { isColorScheme, type SolixColorScheme } from "#/src/color-schemes.ts";

export type LocalStorageColorSchemeManagerOptions = { key?: string };

type Stored = SolixColorScheme | undefined;

export const colorSchemeStorageKey = "solix-color-scheme-value";

function withStorage<T>(use: (storage: Storage) => T, fallback: T): T {
  try {
    return isServer ? fallback : use(globalThis.localStorage);
  } catch {
    return fallback;
  }
}

function schemeIn(value: string | null): Stored {
  return isColorScheme(value) ? value : undefined;
}

export function localStorageColorSchemeManager({
  key = colorSchemeStorageKey,
}: LocalStorageColorSchemeManagerOptions = {}): SolixColorSchemeManager {
  const subscribers = new Set<{ onUpdate: (colorScheme: Stored) => void }>();
  const tell = (colorScheme: Stored) => {
    for (const { onUpdate } of subscribers) onUpdate(colorScheme);
  };
  const followOtherPages = (event: StorageEvent) => {
    if (!withStorage((storage) => event.storageArea === storage, false)) return;
    if (event.key === key) tell(schemeIn(event.newValue));
    if (event.key === null) tell(undefined);
  };
  return {
    get: () => withStorage((storage) => schemeIn(storage.getItem(key)), undefined),
    set: (value) => {
      withStorage((storage) => storage.setItem(key, value), undefined);
      tell(value);
    },
    clear: () => {
      withStorage((storage) => storage.removeItem(key), undefined);
      tell(undefined);
    },
    subscribe: (onUpdate) => {
      const subscriber = { onUpdate };
      if (!isServer && subscribers.size === 0) {
        globalThis.addEventListener("storage", followOtherPages);
      }
      subscribers.add(subscriber);
      return () => {
        subscribers.delete(subscriber);
        if (!isServer && subscribers.size === 0) {
          globalThis.removeEventListener("storage", followOtherPages);
        }
      };
    },
  };
}
