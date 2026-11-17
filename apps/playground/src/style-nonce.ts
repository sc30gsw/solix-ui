import { getRequestEvent, isServer } from "@solidjs/web";

export function styleNonce(): string | undefined {
  if (isServer) {
    const nonce = getRequestEvent()?.nonce;
    return (typeof nonce === "string" ? nonce : nonce?.style) || undefined;
  }
  return document.querySelector<HTMLScriptElement>("script[nonce]")?.nonce || undefined;
}
