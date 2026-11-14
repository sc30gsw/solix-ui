import { Disclosure } from "@solix/core";
import { refOf } from "../ref-of";

export function DisclosureSection() {
  return (
    <Disclosure label="Toggle" ref={refOf("Disclosure")}>
      Hidden content
      <Disclosure label="Inner">Inner content</Disclosure>
    </Disclosure>
  );
}
