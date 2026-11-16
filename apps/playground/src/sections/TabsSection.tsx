import { Box, Button, Tabs } from "@solix/core";
import { createSignal } from "solid-js";
import { refOf } from "../ref-of";

export function TabsSection() {
  const [controlled, setControlled] = createSignal<string | null>("drafts");
  const [refused, setRefused] = createSignal(0);

  return (
    <Box component="section" aria-label="Tabs">
      <Tabs defaultValue="overview" id="account" ref={refOf("Tabs")}>
        <Tabs.List aria-label="Account" ref={refOf("TabsList")}>
          <Tabs.Tab value="overview" leftSection="1" ref={refOf("TabsTab")}>
            Overview
          </Tabs.Tab>
          <Tabs.Tab value="billing" disabled>
            Billing
          </Tabs.Tab>
          <Tabs.Tab value="members">Members</Tabs.Tab>
          <Tabs.Tab value="settings" rightSection="4">
            Settings
          </Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="overview" ref={refOf("TabsPanel")}>
          Overview panel
        </Tabs.Panel>
        <Tabs.Panel value="billing">Billing panel</Tabs.Panel>
        <Tabs.Panel value="members" display="flex">
          Members panel
        </Tabs.Panel>
        <Tabs.Panel value="settings">Settings panel</Tabs.Panel>
      </Tabs>

      <Tabs defaultValue="two" orientation="vertical" loop={false} activateTabWithKeyboard={false}>
        <Tabs.List aria-label="Manual vertical">
          <Tabs.Tab value="one">One</Tabs.Tab>
          <Tabs.Tab value="two">Two</Tabs.Tab>
          <Tabs.Tab value="three">Three</Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="one">One panel</Tabs.Panel>
        <Tabs.Panel value="two">Two panel</Tabs.Panel>
        <Tabs.Panel value="three">Three panel</Tabs.Panel>
      </Tabs>

      <Tabs defaultValue="beta" orientation="vertical">
        <Tabs.List aria-label="Vertical">
          <Tabs.Tab value="alpha">Alpha</Tabs.Tab>
          <Tabs.Tab value="beta">Beta</Tabs.Tab>
          <Tabs.Tab value="gamma">Gamma</Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="alpha">Alpha panel</Tabs.Panel>
        <Tabs.Panel value="beta">Beta panel</Tabs.Panel>
        <Tabs.Panel value="gamma">Gamma panel</Tabs.Panel>
      </Tabs>

      <Tabs allowTabDeactivation keepMounted={false}>
        <Tabs.List aria-label="Optional">
          <Tabs.Tab value="archive" disabled>
            Archive
          </Tabs.Tab>
          <Tabs.Tab value="notes">Notes</Tabs.Tab>
          <Tabs.Tab value="files">Files</Tabs.Tab>
          <Tabs.Tab value="trash" disabled>
            Trash
          </Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="notes">Notes panel</Tabs.Panel>
        <Tabs.Panel value="files" keepMounted>
          Files panel
        </Tabs.Panel>
      </Tabs>

      <Tabs value={controlled()} onChange={(value) => setControlled(value)}>
        <Tabs.List aria-label="Controlled">
          <Tabs.Tab value="inbox">Inbox</Tabs.Tab>
          <Tabs.Tab value="drafts">Drafts</Tabs.Tab>
          <Tabs.Tab
            value="locked"
            onClick={(event) => {
              event.preventDefault();
              setRefused((count) => count + 1);
            }}
          >
            Locked
          </Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="inbox">Inbox panel</Tabs.Panel>
        <Tabs.Panel value="drafts">Drafts panel</Tabs.Panel>
        <Tabs.Panel value="locked">Locked panel</Tabs.Panel>
      </Tabs>
      <output aria-label="Controlled value">{controlled() ?? "none"}</output>
      <output aria-label="Refused presses">{refused()}</output>
      <Button onClick={() => setControlled(null)}>Select none</Button>
    </Box>
  );
}
