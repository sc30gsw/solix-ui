import { createSignal } from "solid-js";
import { Box, Button, Disclosure, Modal, TextInput } from "@solix/core";
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
      <Box component="section" aria-label="Style props" p={{ base: "xs", xs: "sm", md: "lg" }}>
        <Box component={Button} bg="error">
          Background from a style prop
        </Box>
        <Box mt="xl">Style prop margin</Box>
        <Box mt="xl" class="roomy">
          Consumer class margin
        </Box>
        <Box mt="xl" class="roomy" style={{ "margin-top": "var(--playground-pinned-margin)" }}>
          Consumer style margin
        </Box>
        <Box p={{ base: "xs", md: "lg" }} pt={0}>
          Longhand padding
        </Box>
        <Box mt="xl">
          <Box mt="unset">Unset margin</Box>
        </Box>
        <Box hiddenFrom="md">Hidden from md</Box>
        <Box visibleFrom="md">Visible from md</Box>
      </Box>
    </main>
  );
}
