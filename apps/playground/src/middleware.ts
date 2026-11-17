import { randomBytes } from "node:crypto";
import type { StartRequestEvent } from "@solidjs/vite-plugin";

const nonceBytes = 16;

export const policyHeader = "Content-Security-Policy";

export default function giveEachPageAStyleNonce(
  event: StartRequestEvent,
  next: () => Promise<Response>,
): Promise<Response> {
  const nonce = randomBytes(nonceBytes).toString("base64");
  event.nonce = nonce;
  event.response.headers.set(
    policyHeader,
    `style-src 'self' 'nonce-${nonce}'; style-src-attr 'unsafe-inline'`,
  );
  return next();
}
