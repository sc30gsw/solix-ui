import { TextInput } from "@solix/core";
import { refOf } from "../ref-of";

export function TextInputSection() {
  return (
    <>
      <TextInput aria-label="Email" type="email" placeholder="Email" ref={refOf("TextInput")} />
      <TextInput aria-label="Overridden input" class="danger" />
      <TextInput aria-label="Disabled input" disabled />
    </>
  );
}
