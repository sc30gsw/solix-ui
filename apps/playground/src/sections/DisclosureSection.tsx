import { Disclosure } from "@solix/core";
import { refOf } from "#/src/ref-of.ts";

export function DisclosureSection() {
  return (
    <Disclosure label="Toggle" ref={refOf("Disclosure")}>
      Hidden content
      <Disclosure label="Inner">Inner content</Disclosure>
    </Disclosure>
  );
}
