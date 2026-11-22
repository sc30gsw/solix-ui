import {
  Box,
  Button,
  colorSchemeAttribute,
  createColorScheme,
  createTheme,
  localStorageColorSchemeManager,
  type SolixColorScheme,
  type SolixComputedColorScheme,
  SolixProvider,
  type SolixProviderProps,
  type SolixTheme,
} from "@solix/core";
import { createEffect, createSignal, Show } from "solid-js";
import { argTypesOf } from "virtual:story-controls";
import { expect, spyOn, userEvent, waitFor } from "storybook/test";
import { everyValueOf } from "#/every-value.tsx";
import type { ComponentMeta, ComponentStory } from "#/story-meta.ts";

const themedPadding = "3rem";
const schemeRoot = "Scheme root";
const storageKeys = {
  unused: "story-default-color-scheme",
  changingDefault: "story-changing-default",
  shared: "story-shared-color-scheme",
  outer: "story-outer-color-scheme",
  mounted: "story-mounted-color-scheme",
  inline: "story-inline-color-scheme",
  forced: "story-forced-color-scheme",
};
const storeOfThePage = localStorageColorSchemeManager();

function OnItsOwnElement(props: SolixProviderProps & { label?: string }) {
  const [root, setRoot] = createSignal<HTMLElement>();
  return (
    <SolixProvider getRootElement={root} {...props}>
      <section aria-label={props.label ?? schemeRoot} ref={setRoot}>
        {props.children}
      </section>
    </SolixProvider>
  );
}

function SchemeButtons(props: { of: string }) {
  const { colorScheme, setColorScheme, toggleColorScheme, clearColorScheme } = createColorScheme();
  return (
    <>
      <Button onClick={() => setColorScheme("dark")}>Dark in {props.of}</Button>
      <Button onClick={toggleColorScheme}>Toggle in {props.of}</Button>
      <Button onClick={clearColorScheme}>Clear in {props.of}</Button>
      <output aria-label={`Chosen in ${props.of}`}>{colorScheme()}</output>
    </>
  );
}

function schemeOn(element: HTMLElement): string | null {
  return element.getAttribute(colorSchemeAttribute);
}

const meta = {
  component: SolixProvider,
  argTypes: argTypesOf(SolixProvider),
  args: { theme: createTheme({ spacing: { md: themedPadding } }) },
  beforeEach: () => {
    for (const key of Object.values(storageKeys)) localStorage.removeItem(key);
    storeOfThePage.clear();
  },
  render: (args) => (
    <OnItsOwnElement {...args}>
      <Box p="md" data-testid="themed">
        Padded by the theme's md spacing
      </Box>
    </OnItsOwnElement>
  ),
} satisfies ComponentMeta<typeof SolixProvider>;

export default meta;

type Story = ComponentStory<typeof meta>;

export const ThemedSpacing: Story = {
  args: { withCssVariables: true },
  play: async ({ canvas }) => {
    const probe = document.createElement("div");
    probe.style.paddingTop = themedPadding;
    document.body.append(probe);
    const expected = getComputedStyle(probe).paddingTop;
    probe.remove();
    await expect(canvas.getByTestId("themed")).toHaveStyle({ paddingTop: expected });
  },
};

const notPalettes = ["bleu", "red.6"];

function themeWithPrimary(primaryColor: string): SolixTheme {
  const theme = createTheme({});
  Reflect.set(theme, "primaryColor", primaryColor);
  return theme;
}

export const PrimaryColorFallsBack: Story = {
  render: () => (
    <>
      {notPalettes.map((primaryColor) => (
        <OnItsOwnElement
          label={`Primary ${primaryColor}`}
          theme={themeWithPrimary(primaryColor)}
          cssVariablesSelector=".unused"
        >
          <p>{`Primary ${primaryColor}`}</p>
        </OnItsOwnElement>
      ))}
    </>
  ),
  beforeEach: () => {
    const warnings = spyOn(globalThis.console, "warn").mockImplementation(() => undefined);
    return () => warnings.mockRestore();
  },
  play: async () => {
    for (const primaryColor of notPalettes) {
      await expect(globalThis.console.warn).toHaveBeenCalledWith(
        expect.stringContaining(`"${primaryColor}"`),
      );
    }
  },
};

export const WithoutCssVariables: Story = {
  args: { withCssVariables: false },
  play: async ({ canvas }) => {
    const probe = document.createElement("div");
    probe.style.paddingTop = themedPadding;
    document.body.append(probe);
    const themed = getComputedStyle(probe).paddingTop;
    probe.remove();
    await expect(canvas.getByTestId("themed")).not.toHaveStyle({ paddingTop: themed });
  },
};

const providerNonce = "provider-nonce";

export const GivesItsNonceToItsStyles: Story = {
  args: { getStyleNonce: () => providerNonce },
  play: async ({ canvasElement }) => {
    const styles = [...canvasElement.ownerDocument.querySelectorAll("style")];
    await expect(styles.find((style) => style.nonce === providerNonce)).toBeInstanceOf(
      HTMLStyleElement,
    );
  },
};

const systemDark = "(prefers-color-scheme: dark)";

function systemPrefers(scheme: SolixComputedColorScheme): () => void {
  const real = window.matchMedia;
  window.matchMedia = (query: string) =>
    query === systemDark
      ? {
          matches: scheme === "dark",
          media: query,
          onchange: null,
          addEventListener: () => undefined,
          removeEventListener: () => undefined,
          addListener: () => undefined,
          removeListener: () => undefined,
          dispatchEvent: () => false,
        }
      : real.call(window, query);
  return () => {
    window.matchMedia = real;
  };
}

export const EveryDefaultColorScheme: Story = {
  ...everyValueOf(meta, "defaultColorScheme", {}, { rendersAs: { auto: "dark" } }),
  beforeEach: () => systemPrefers("dark"),
};

export const EveryForcedColorScheme: Story = everyValueOf(meta, "forceColorScheme");

const unusedManager = localStorageColorSchemeManager({ key: storageKeys.unused });

export const DefaultsToLight: Story = {
  render: () => (
    <OnItsOwnElement colorSchemeManager={unusedManager}>
      <SchemeButtons of="the provider" />
    </OnItsOwnElement>
  ),
  play: async ({ canvas }) => {
    await waitFor(() =>
      expect(canvas.getByRole("region")).toHaveAttribute(colorSchemeAttribute, "light"),
    );
    await expect(canvas.getByRole("status")).toHaveTextContent("light");
  },
};

export const FollowsTheSystemWhenItsDefaultIsAuto: Story = {
  beforeEach: () => systemPrefers("light"),
  render: () => (
    <OnItsOwnElement colorSchemeManager={unusedManager} defaultColorScheme="auto">
      <SchemeButtons of="the provider" />
    </OnItsOwnElement>
  ),
  play: async ({ canvas }) => {
    await waitFor(() =>
      expect(canvas.getByRole("region")).toHaveAttribute(colorSchemeAttribute, "light"),
    );
    await expect(canvas.getByRole("status")).toHaveTextContent("auto");
  },
};

const managerOfTheChangingDefault = localStorageColorSchemeManager({
  key: storageKeys.changingDefault,
});

function ChangingDefault() {
  const [given, setGiven] = createSignal<SolixColorScheme>("light");
  return (
    <OnItsOwnElement colorSchemeManager={managerOfTheChangingDefault} defaultColorScheme={given()}>
      <Button onClick={() => setGiven("dark")}>Default to dark</Button>
      <SchemeButtons of="the provider" />
    </OnItsOwnElement>
  );
}

export const FollowsItsDefaultWhileNothingIsStored: Story = {
  beforeEach: () => systemPrefers("dark"),
  render: () => <ChangingDefault />,
  play: async ({ canvas }) => {
    const region = () => canvas.getByRole("region");

    await waitFor(() => expect(region()).toHaveAttribute(colorSchemeAttribute, "light"));
    await userEvent.click(canvas.getByRole("button", { name: "Default to dark" }));
    await waitFor(() => expect(region()).toHaveAttribute(colorSchemeAttribute, "dark"));
    await userEvent.click(canvas.getByRole("button", { name: "Toggle in the provider" }));
    await waitFor(() => expect(region()).toHaveAttribute(colorSchemeAttribute, "light"));
    await userEvent.click(canvas.getByRole("button", { name: "Clear in the provider" }));
    await waitFor(() => expect(region()).toHaveAttribute(colorSchemeAttribute, "dark"));
  },
};

const sharedManager = localStorageColorSchemeManager({ key: storageKeys.shared });

export const TwoProvidersFollowOneManager: Story = {
  render: () => (
    <>
      <OnItsOwnElement label="the first" colorSchemeManager={sharedManager}>
        <SchemeButtons of="the first" />
      </OnItsOwnElement>
      <OnItsOwnElement label="the second" colorSchemeManager={sharedManager}>
        <SchemeButtons of="the second" />
      </OnItsOwnElement>
    </>
  ),
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Dark in the first" }));
    await waitFor(() => everyRegionIn(canvas, "dark", 2));
    await userEvent.click(canvas.getByRole("button", { name: "Clear in the second" }));
    await waitFor(() => everyRegionIn(canvas, "light", 2));
  },
};

type Canvas = Parameters<NonNullable<Story["play"]>>[0]["canvas"];

async function everyRegionIn(canvas: Canvas, scheme: string, count?: number): Promise<void> {
  const regions = canvas.getAllByRole("region");
  if (count !== undefined) await expect(regions).toHaveLength(count);
  for (const region of regions) await expect(region).toHaveAttribute(colorSchemeAttribute, scheme);
}

type Press = readonly [button: string, scheme: string, stored: SolixColorScheme | undefined];

async function pressAndSee(
  canvas: Canvas,
  stored: () => SolixColorScheme | undefined,
  presses: readonly Press[],
) {
  for (const [button, scheme, kept] of presses) {
    await userEvent.click(canvas.getByRole("button", { name: button }));
    await waitFor(() => everyRegionIn(canvas, scheme));
    for (const chosen of canvas.getAllByRole("status")) {
      await expect(chosen).toHaveTextContent(scheme);
    }
    await expect(stored()).toBe(kept);
  }
}

export const KeepsAManagerWrittenInTheProp: Story = {
  render: () => (
    <OnItsOwnElement
      colorSchemeManager={localStorageColorSchemeManager({ key: storageKeys.inline })}
    >
      <SchemeButtons of="the provider" />
    </OnItsOwnElement>
  ),
  play: async ({ canvas }) => {
    await pressAndSee(canvas, localStorageColorSchemeManager({ key: storageKeys.inline }).get, [
      ["Dark in the provider", "dark", "dark"],
      ["Toggle in the provider", "light", "light"],
      ["Toggle in the provider", "dark", "dark"],
      ["Clear in the provider", "light", undefined],
    ]);
  },
};

export const SharesThePageManagerWhenGivenNone: Story = {
  render: () => (
    <>
      <OnItsOwnElement label="the first">
        <SchemeButtons of="the first" />
      </OnItsOwnElement>
      <OnItsOwnElement label="the second">
        <SchemeButtons of="the second" />
      </OnItsOwnElement>
    </>
  ),
  play: async ({ canvas }) => {
    await pressAndSee(canvas, storeOfThePage.get, [
      ["Dark in the first", "dark", "dark"],
      ["Toggle in the second", "light", "light"],
      ["Toggle in the first", "dark", "dark"],
      ["Clear in the second", "light", undefined],
    ]);
  },
};

const outerManager = localStorageColorSchemeManager({ key: storageKeys.outer });

export const NestedProviderPassesTheSchemeOn: Story = {
  render: () => (
    <OnItsOwnElement colorSchemeManager={outerManager}>
      <SolixProvider theme={createTheme({ spacing: { md: themedPadding } })}>
        <SchemeButtons of="the inner provider" />
      </SolixProvider>
    </OnItsOwnElement>
  ),
  play: async ({ canvas }) => {
    const region = () => canvas.getByRole("region");
    const ofThePage = schemeOn(document.documentElement);

    await waitFor(() => expect(region()).toHaveAttribute(colorSchemeAttribute, "light"));
    await userEvent.click(canvas.getByRole("button", { name: "Dark in the inner provider" }));
    await waitFor(() => expect(region()).toHaveAttribute(colorSchemeAttribute, "dark"));
    await expect(canvas.getByRole("status")).toHaveTextContent("dark");
    await expect(schemeOn(document.documentElement)).toBe(ofThePage);
    await userEvent.click(canvas.getByRole("button", { name: "Clear in the inner provider" }));
    await waitFor(() => expect(region()).toHaveAttribute(colorSchemeAttribute, "light"));
  },
};

function RootThatMountsLater() {
  const [shown, setShown] = createSignal(false);
  const [root, setRoot] = createSignal<HTMLElement>();
  return (
    <SolixProvider forceColorScheme="dark" getRootElement={root}>
      <Button onClick={() => setShown(true)}>Show the root</Button>
      <Show when={shown()}>
        <section aria-label={schemeRoot} ref={setRoot} />
      </Show>
    </SolixProvider>
  );
}

export const WritesOnARootThatMountsLater: Story = {
  render: () => <RootThatMountsLater />,
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Show the root" }));
    await waitFor(() =>
      expect(canvas.getByRole("region")).toHaveAttribute(colorSchemeAttribute, "dark"),
    );
  },
};

const managerOfTheForced = localStorageColorSchemeManager({ key: storageKeys.forced });

function SeenSchemes() {
  const { colorScheme } = createColorScheme();
  let seen: HTMLOutputElement | undefined;
  createEffect(colorScheme, (scheme) => seen?.append(`${scheme} `));
  return <output aria-label="Seen by an effect" ref={(node) => (seen = node)} />;
}

function ForcedThenFree() {
  const [forced, setForced] = createSignal<SolixComputedColorScheme | undefined>("light");
  return (
    <OnItsOwnElement
      colorSchemeManager={managerOfTheForced}
      defaultColorScheme="auto"
      forceColorScheme={forced()}
    >
      <Button onClick={() => setForced((now) => (now === undefined ? "light" : undefined))}>
        Force or free
      </Button>
      <SeenSchemes />
    </OnItsOwnElement>
  );
}

export const GivesTheStoredSchemeWhenTheForceIsLifted: Story = {
  beforeEach: () => {
    localStorage.setItem(storageKeys.forced, "dark");
  },
  render: () => <ForcedThenFree />,
  play: async ({ canvas }) => {
    const region = () => canvas.getByRole("region");
    const forceOrFree = canvas.getByRole("button", { name: "Force or free" });

    await waitFor(() => expect(region()).toHaveAttribute(colorSchemeAttribute, "light"));
    await userEvent.click(forceOrFree);
    await waitFor(() => expect(region()).toHaveAttribute(colorSchemeAttribute, "dark"));
    await userEvent.click(forceOrFree);
    await waitFor(() => expect(region()).toHaveAttribute(colorSchemeAttribute, "light"));
    await userEvent.click(forceOrFree);
    await waitFor(() => expect(region()).toHaveAttribute(colorSchemeAttribute, "dark"));
    await expect(canvas.getByRole("status")).toHaveTextContent(/^light dark light dark$/);
  },
};

const managerOfTheMounted = localStorageColorSchemeManager({ key: storageKeys.mounted });

function Mounted() {
  const [mounted, setMounted] = createSignal(false);
  return (
    <>
      <Button onClick={() => setMounted((now) => !now)}>Mount or unmount</Button>
      <Show when={mounted()}>
        <OnItsOwnElement colorSchemeManager={managerOfTheMounted}>
          <SchemeButtons of="the mounted provider" />
        </OnItsOwnElement>
      </Show>
    </>
  );
}

export const LeavesNoStorageListener: Story = {
  render: () => <Mounted />,
  play: async ({ canvas }) => {
    const added = spyOn(window, "addEventListener");
    const removed = spyOn(window, "removeEventListener");
    const storageListeners = (calls: unknown[][]) =>
      calls.filter(([type]) => type === "storage").map(([, listener]) => listener);
    const toggle = canvas.getByRole("button", { name: "Mount or unmount" });

    await userEvent.click(toggle);
    await waitFor(() => expect(storageListeners(added.mock.calls)).toHaveLength(1));
    await expect(storageListeners(removed.mock.calls)).toEqual([]);
    await userEvent.click(toggle);
    await waitFor(() =>
      expect(storageListeners(removed.mock.calls)).toEqual(storageListeners(added.mock.calls)),
    );
    added.mockRestore();
    removed.mockRestore();
  },
};
