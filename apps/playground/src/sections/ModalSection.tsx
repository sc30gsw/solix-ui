import { createSignal } from "solid-js";
import { Button, Modal, TextInput } from "@solix/core";
import { refOf } from "../ref-of";

export function ModalSection() {
  const [modalOpened, setModalOpened] = createSignal(false);

  return (
    <>
      <Button onClick={() => setModalOpened(true)}>Open modal</Button>
      <p>The app records the modal as {modalOpened() ? "opened" : "closed"}.</p>
      <Modal
        label="Settings"
        opened={modalOpened()}
        onClose={() => setModalOpened(false)}
        ref={refOf("Modal")}
      >
        <TextInput aria-label="Name" />
        <p>Modal content</p>
      </Modal>
    </>
  );
}
