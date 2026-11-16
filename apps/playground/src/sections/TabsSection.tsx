import { Box, Button, Tabs, TextInput } from "@solix/core";
import { createSignal, For, Show } from "solid-js";
import { refOf } from "../ref-of";

function tabValuesIn(text: string): string[] | undefined {
  try {
    const parsed: unknown = JSON.parse(text);
    if (!Array.isArray(parsed)) return undefined;
    const values = parsed.filter((value): value is string => typeof value === "string");
    return values.length === parsed.length && new Set(values).size === values.length
      ? values
      : undefined;
  } catch {
    return undefined;
  }
}

export function TabsSection() {
  const [controlled, setControlled] = createSignal<string | null>("drafts");
  const [refused, setRefused] = createSignal(0);
  const [countsHovers, setCountsHovers] = createSignal(false);
  const [draftsHovers, setDraftsHovers] = createSignal(0);
  const [generated, setGenerated] = createSignal(["my tab", "100%"]);
  const [panelsMounted, setPanelsMounted] = createSignal(true);

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
          <Tabs.Tab
            value="drafts"
            {...(countsHovers()
              ? { onPointerEnter: () => setDraftsHovers((count) => count + 1) }
              : {})}
          >
            Drafts
          </Tabs.Tab>
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
      <output aria-label="Drafts hovers">{draftsHovers()}</output>
      <Button onClick={() => setControlled(null)}>Select none</Button>
      <Button onClick={() => setCountsHovers(true)}>Count hovers over Drafts</Button>

      <Tabs id="generated">
        <Tabs.List aria-label="Generated">
          <For each={generated()}>{(value) => <Tabs.Tab value={value}>{value}</Tabs.Tab>}</For>
        </Tabs.List>
        <Show when={panelsMounted()}>
          <For each={generated()}>
            {(value) => <Tabs.Panel value={value}>{`Panel of ${value}`}</Tabs.Panel>}
          </For>
        </Show>
      </Tabs>
      <TextInput
        aria-label="Tab values"
        onInput={(event) =>
          setGenerated((current) => tabValuesIn(event.currentTarget.value) ?? current)
        }
      />
      <Button onClick={() => setPanelsMounted((mounted) => !mounted)}>
        {panelsMounted() ? "Unmount the panels" : "Mount the panels"}
      </Button>
    </Box>
  );
}
