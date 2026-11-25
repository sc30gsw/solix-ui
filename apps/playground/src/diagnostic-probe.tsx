import { getRequestEvent, isDev, isServer } from "@solidjs/web";
import { Errored, Show } from "solid-js";

export const diagnosticProbeParameter = "solid-diagnostic-probe";
export const diagnosticProbeMessage = "The playground's diagnostic probe threw on purpose.";

function probeRequested(): boolean {
  const url = isServer ? getRequestEvent()?.request.url : globalThis.location?.href;
  return (
    url !== undefined && new URL(url, "http://localhost").searchParams.has(diagnosticProbeParameter)
  );
}

function ThrowsOnPurpose(): never {
  throw new Error(diagnosticProbeMessage);
}

export function DiagnosticProbe() {
  if (!isDev) return null;
  return (
    <Show when={probeRequested()}>
      <Errored fallback={<p>The diagnostic probe threw.</p>}>
        <ThrowsOnPurpose />
      </Errored>
    </Show>
  );
}
