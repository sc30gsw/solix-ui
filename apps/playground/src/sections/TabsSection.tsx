import { render } from "@solidjs/web";
import { Box, Button, Tabs, TextInput } from "@solix/core";
import { createSignal, For, Show } from "solid-js";
import { refOf } from "#/src/ref-of.ts";
import {
  controlled as controlledList,
  type ControlledSetup,
  controlledSetupOf,
  displayedByTheApp,
  generated as generatedList,
  held as heldList,
  inAShadowRoot,
  panelOf,
  tabNames,
  tabsSetups,
  valueOf,
} from "#/src/sections/tabs-setups.ts";

const { inbox, drafts, locked } = tabNames.controlled;
const { kept, asked, styled, classed } = tabNames.held;
const { near, middle, far } = tabNames.inAShadowRoot;
const controlledSetup = controlledSetupOf(controlledList);
const heldSetup = controlledSetupOf(heldList);

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
    <Tabs defaultValue={valueOf(near)}>
      <Tabs.List aria-label={inAShadowRoot}>
        <Tabs.Tab value={valueOf(near)}>{near}</Tabs.Tab>
        <Tabs.Tab value={valueOf(middle)} disabled>
          {middle}
        </Tabs.Tab>
        <Tabs.Tab value={valueOf(far)}>{far}</Tabs.Tab>
      </Tabs.List>
      <Tabs.Panel value={valueOf(near)}>{panelOf(near)}</Tabs.Panel>
      <Tabs.Panel value={valueOf(middle)}>{panelOf(middle)}</Tabs.Panel>
      <Tabs.Panel value={valueOf(far)}>{panelOf(far)}</Tabs.Panel>
    </Tabs>
  );
}

function renderInAShadowRootOf(host: Element | null | undefined): void {
  if (host && host.shadowRoot === null) {
    render(() => <TabsInAShadowRoot />, host.attachShadow({ mode: "open" }));
  }
}

function refusedIn(
  setup: ControlledSetup,
  name: string,
  refuse: (event: MouseEvent) => void,
): { onClick?: (event: MouseEvent) => void } {
  return setup.refused === name ? { onClick: refuse } : {};
}

export function TabsSection() {
  const [controlled, setControlled] = createSignal<string | null>(valueOf(controlledSetup.value));
  const [heldValue, setHeldValue] = createSignal<string | null>(valueOf(heldSetup.value));
  const [refused, setRefused] = createSignal(0);
  const [countsHovers, setCountsHovers] = createSignal(false);
  const [draftsHovers, setDraftsHovers] = createSignal(0);
  const [countsListHovers, setCountsListHovers] = createSignal(false);
  const [listHovers, setListHovers] = createSignal(0);
  const [sectionsCreated, setSectionsCreated] = createSignal(0);
  const [heldRequests, setHeldRequests] = createSignal(0);
  const [generated, setGenerated] = createSignal(["my tab", "100%"]);
  const [panelsMounted, setPanelsMounted] = createSignal(true);
  const refuse = (event: MouseEvent) => {
    event.preventDefault();
    setRefused((count) => count + 1);
  };

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

      <Tabs
        value={controlled()}
        onChange={(value) => {
          if (controlledSetup.follows) setControlled(value);
        }}
        ref={refOf("Tabs")}
      >
        <Tabs.List
          aria-label={controlledList}
          ref={refOf("TabsList")}
          {...(countsListHovers()
            ? { onPointerEnter: () => setListHovers((count) => count + 1) }
            : {})}
        >
          <Tabs.Tab
            value={valueOf(inbox)}
            leftSection={<span ref={() => setSectionsCreated((count) => count + 1)}>In</span>}
            ref={refOf("TabsTab")}
            {...refusedIn(controlledSetup, inbox, refuse)}
          >
            <span>{inbox}</span>
          </Tabs.Tab>
          <Tabs.Tab
            value={valueOf(drafts)}
            {...refusedIn(controlledSetup, drafts, refuse)}
            {...(countsHovers()
              ? { onPointerEnter: () => setDraftsHovers((count) => count + 1) }
              : {})}
          >
            {drafts}
          </Tabs.Tab>
          <Tabs.Tab value={valueOf(locked)} {...refusedIn(controlledSetup, locked, refuse)}>
            {locked}
          </Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value={valueOf(inbox)} ref={refOf("TabsPanel")}>
          {panelOf(inbox)}
        </Tabs.Panel>
        <Tabs.Panel value={valueOf(drafts)}>{panelOf(drafts)}</Tabs.Panel>
        <Tabs.Panel value={valueOf(locked)}>{panelOf(locked)}</Tabs.Panel>
      </Tabs>
      <output aria-label="Controlled value">{controlled() ?? "none"}</output>
      <output aria-label="Refused presses">{refused()}</output>
      <output aria-label="Drafts hovers">{draftsHovers()}</output>
      <output aria-label="List hovers">{listHovers()}</output>
      <output aria-label="Section elements created">{sectionsCreated()}</output>
      <Button onClick={() => setControlled(null)}>Select none</Button>
      <Button onClick={() => setCountsHovers(true)}>Count hovers over Drafts</Button>
      <Button onClick={() => setCountsListHovers(true)}>Count hovers over the list</Button>

      <Tabs
        value={heldValue()}
        onChange={(value) => {
          setHeldRequests((count) => count + 1);
          if (heldSetup.follows) setHeldValue(value);
        }}
      >
        <Tabs.List aria-label={heldList}>
          <Tabs.Tab value={valueOf(kept)}>{kept}</Tabs.Tab>
          <Tabs.Tab value={valueOf(asked)}>{asked}</Tabs.Tab>
          <Tabs.Tab value={valueOf(styled)}>{styled}</Tabs.Tab>
          <Tabs.Tab value={valueOf(classed)}>{classed}</Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value={valueOf(kept)}>{panelOf(kept)}</Tabs.Panel>
        <Tabs.Panel value={valueOf(asked)}>{panelOf(asked)}</Tabs.Panel>
        <Tabs.Panel value={valueOf(styled)} style={displayedByTheApp.style}>
          {panelOf(styled)}
        </Tabs.Panel>
        <Tabs.Panel value={valueOf(classed)} class={displayedByTheApp.class}>
          {panelOf(classed)}
        </Tabs.Panel>
      </Tabs>
      <output aria-label="Held requests">{heldRequests()}</output>

      <TextInput
        aria-label="Tab values"
        onInput={(event) =>
          setGenerated((current) => tabValuesIn(event.currentTarget.value) ?? current)
        }
      />
      <Button onClick={() => setPanelsMounted((mounted) => !mounted)}>
        {panelsMounted() ? "Unmount the panels" : "Mount the panels"}
      </Button>
      <Tabs id="generated">
        <Tabs.List aria-label={generatedList}>
          <For each={generated()}>{(value) => <Tabs.Tab value={value}>{value}</Tabs.Tab>}</For>
        </Tabs.List>
        <Show when={panelsMounted()}>
          <For each={generated()}>
            {(value) => <Tabs.Panel value={value}>{`Panel of ${value}`}</Tabs.Panel>}
          </For>
        </Show>
      </Tabs>

      <Button onClick={(event) => renderInAShadowRootOf(event.currentTarget.nextElementSibling)}>
        Render tabs in a shadow root
      </Button>
      <div />
    </Box>
  );
}
