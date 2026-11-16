import { render } from "@solidjs/web";
import { Box, Button, Tabs, TextInput } from "@solix/core";
import { createSignal, For, Show } from "solid-js";
import { refOf } from "../ref-of";
import { panelOf, tabsSetups, valueOf } from "./tabs-setups";

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

function TabsInAShadowRoot() {
  return (
    <Tabs defaultValue="near">
      <Tabs.List aria-label="In a shadow root">
        <Tabs.Tab value="near">Near</Tabs.Tab>
        <Tabs.Tab value="middle" disabled>
          Middle
        </Tabs.Tab>
        <Tabs.Tab value="far">Far</Tabs.Tab>
      </Tabs.List>
      <Tabs.Panel value="near">Near panel</Tabs.Panel>
      <Tabs.Panel value="middle">Middle panel</Tabs.Panel>
      <Tabs.Panel value="far">Far panel</Tabs.Panel>
    </Tabs>
  );
}

function renderInAShadowRootOf(host: Element | null | undefined): void {
  if (host && host.shadowRoot === null) {
    render(() => <TabsInAShadowRoot />, host.attachShadow({ mode: "open" }));
  }
}

export function TabsSection() {
  const [controlled, setControlled] = createSignal<string | null>("drafts");
  const [refused, setRefused] = createSignal(0);
  const [countsHovers, setCountsHovers] = createSignal(false);
  const [draftsHovers, setDraftsHovers] = createSignal(0);
  const [countsListHovers, setCountsListHovers] = createSignal(false);
  const [listHovers, setListHovers] = createSignal(0);
  const [sectionsCreated, setSectionsCreated] = createSignal(0);
  const [heldRequests, setHeldRequests] = createSignal(0);
  const [generated, setGenerated] = createSignal(["my tab", "100%"]);
  const [panelsMounted, setPanelsMounted] = createSignal(true);

  return (
    <Box component="section" aria-label="Tabs">
      <For each={tabsSetups}>
        {(setup) => (
          <Tabs
            id={setup.id}
            dir={setup.direction}
            defaultValue={setup.initial === null ? null : valueOf(setup.initial)}
            orientation={setup.orientation}
            loop={setup.loop}
            activateTabWithKeyboard={setup.selectsOnArrow}
            allowTabDeactivation={setup.deselects}
            keepMounted={setup.keepsHiddenPanels}
          >
            <Tabs.List aria-label={setup.list}>
              <For each={setup.tabs}>
                {(tab) => (
                  <Tabs.Tab
                    value={valueOf(tab.name)}
                    disabled={tab.disabled}
                    leftSection={tab.leftSection && <span>{tab.leftSection}</span>}
                    rightSection={tab.rightSection && <span>{tab.rightSection}</span>}
                  >
                    {tab.name}
                  </Tabs.Tab>
                )}
              </For>
            </Tabs.List>
            <For each={setup.tabs}>
              {(tab) => (
                <Show when={tab.panel}>
                  {(panel) => (
                    <Tabs.Panel
                      value={valueOf(tab.name)}
                      display={panel().display}
                      keepMounted={panel().keepMounted}
                    >
                      {panelOf(tab.name)}
                    </Tabs.Panel>
                  )}
                </Show>
              )}
            </For>
          </Tabs>
        )}
      </For>

      <Tabs value={controlled()} onChange={(value) => setControlled(value)} ref={refOf("Tabs")}>
        <Tabs.List
          aria-label="Controlled"
          ref={refOf("TabsList")}
          {...(countsListHovers()
            ? { onPointerEnter: () => setListHovers((count) => count + 1) }
            : {})}
        >
          <Tabs.Tab
            value="inbox"
            leftSection={<span ref={() => setSectionsCreated((count) => count + 1)}>In</span>}
            ref={refOf("TabsTab")}
          >
            <span>Inbox</span>
          </Tabs.Tab>
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
        <Tabs.Panel value="inbox" ref={refOf("TabsPanel")}>
          Inbox panel
        </Tabs.Panel>
        <Tabs.Panel value="drafts">Drafts panel</Tabs.Panel>
        <Tabs.Panel value="locked">Locked panel</Tabs.Panel>
      </Tabs>
      <output aria-label="Controlled value">{controlled() ?? "none"}</output>
      <output aria-label="Refused presses">{refused()}</output>
      <output aria-label="Drafts hovers">{draftsHovers()}</output>
      <output aria-label="List hovers">{listHovers()}</output>
      <output aria-label="Section elements created">{sectionsCreated()}</output>
      <Button onClick={() => setControlled(null)}>Select none</Button>
      <Button onClick={() => setCountsHovers(true)}>Count hovers over Drafts</Button>
      <Button onClick={() => setCountsListHovers(true)}>Count hovers over the list</Button>

      <Tabs value="kept" onChange={() => setHeldRequests((count) => count + 1)}>
        <Tabs.List aria-label="Held">
          <Tabs.Tab value="kept">Kept</Tabs.Tab>
          <Tabs.Tab value="asked">Asked</Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="kept">Kept panel</Tabs.Panel>
        <Tabs.Panel value="asked">Asked panel</Tabs.Panel>
      </Tabs>
      <output aria-label="Held requests">{heldRequests()}</output>

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

      <Button onClick={(event) => renderInAShadowRootOf(event.currentTarget.nextElementSibling)}>
        Render tabs in a shadow root
      </Button>
      <div />
    </Box>
  );
}
