import { isServer } from "@solidjs/web";
import { DEV } from "solid-js";

export function warnInTheBrowserDuringDevelopment(message: () => string): void {
  if (DEV && !isServer) console.warn(`[solix] ${message()}`);
}
