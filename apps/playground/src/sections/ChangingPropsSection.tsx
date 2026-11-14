import { createSignal } from "solid-js";
import { Button, Disclosure } from "@solix/core";

export function ChangingPropsSection() {
  const [emphasised, setEmphasised] = createSignal(false);

  return (
    <>
      <Button
        class={{ danger: emphasised() }}
        aria-pressed={emphasised() ? "true" : "false"}
        onClick={() => setEmphasised((current) => !current)}
      >
        Emphasise
      </Button>
      <Disclosure
        label="Follows"
        class={{ outlined: emphasised() }}
        classes={{ summary: { danger: emphasised() } }}
      >
        Follows the Emphasise button
      </Disclosure>
    </>
  );
}
