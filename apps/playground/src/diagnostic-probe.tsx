import { getRequestEvent, isServer } from "@solidjs/web";
import { Errored, Show } from "solid-js";

export const diagnosticProbeParameter = "solid-diagnostic-probe";
export const diagnosticProbeMessage = "The playground's diagnostic probe threw on purpose.";

function askedForOnTheDevelopmentServer(): boolean {
  if (!import.meta.env.DEV || !isServer) return false;
  const url = getRequestEvent()?.request.url;
  return url !== undefined && new URL(url).searchParams.has(diagnosticProbeParameter);
}

function ThrowsOnPurpose(): never {
  throw new Error(diagnosticProbeMessage);
}

export function DiagnosticProbe() {
  return (
    <Show when={askedForOnTheDevelopmentServer()}>
      <Errored fallback={<p>The diagnostic probe threw.</p>}>
        <ThrowsOnPurpose />
      </Errored>
    </Show>
  );
}
