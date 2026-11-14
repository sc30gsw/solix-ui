import { createSignal } from "solid-js";
import { Button, Disclosure, Modal, TextInput } from "@solix/core";
import "./app.css";
import "@solix/core/styles.css";

export default function App() {
  const [emphasised, setEmphasised] = createSignal(false);
  const [modalOpened, setModalOpened] = createSignal(false);

  return (
    <main>
      <h1>Solix playground</h1>
      <Button data-testid="default">Default</Button>
      <Button data-testid="overridden" class="danger">
        Overridden
      </Button>
      <div class="brand-green">
        <Button data-testid="themed">Themed</Button>
      </div>
      <Button
        class={{ danger: emphasised() }}
        aria-pressed={emphasised() ? "true" : "false"}
        onClick={() => setEmphasised((current) => !current)}
      >
        Emphasise
      </Button>
      <Disclosure label="Follows" class={{ outlined: emphasised() }}>
        Follows the Emphasise button
      </Disclosure>
      <Disclosure label="Toggle">
        Hidden content
        <Disclosure label="Inner">Inner content</Disclosure>
      </Disclosure>
      <TextInput aria-label="Email" type="email" placeholder="Email" />
      <TextInput aria-label="Overridden input" class="danger" />
      <TextInput aria-label="Disabled input" disabled />
      <Button onClick={() => setModalOpened(true)}>Open modal</Button>
      <p>The app records the modal as {modalOpened() ? "opened" : "closed"}.</p>
      <Modal label="Settings" opened={modalOpened()} onClose={() => setModalOpened(false)}>
        <TextInput aria-label="Name" />
        <p>Modal content</p>
      </Modal>
    </main>
  );
}
