import {
  Box,
  Button,
  colorSchemeAttribute,
  createColorScheme,
  createTheme,
  isColorScheme,
  localStorageColorSchemeManager,
  type SolixColorScheme,
  type SolixColorSchemeManager,
  SolixProvider,
} from "@solix/core";
import { createSignal, Show } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, spyOn, userEvent, waitFor } from "storybook/test";

const themedPadding = "3rem";

function schemeOfThePage(): SolixColorScheme | undefined {
  const scheme = document.documentElement.getAttribute(colorSchemeAttribute);
  return isColorScheme(scheme) ? scheme : undefined;
}

const meta = {
  component: SolixProvider,
  args: { theme: createTheme({ spacing: { md: themedPadding } }) },
  render: (args) => (
    <SolixProvider defaultColorScheme={schemeOfThePage()} {...args}>
      <Box p="md" data-testid="themed">
        Padded by the theme's md spacing
      </Box>
    </SolixProvider>
  ),
} satisfies Meta<typeof SolixProvider>;

export default meta;

type Story = StoryObj<typeof meta>;

export const ThemedSpacing: Story = {
  play: async ({ canvas }) => {
    const probe = document.createElement("div");
    probe.style.paddingTop = themedPadding;
    document.body.append(probe);
    const expected = getComputedStyle(probe).paddingTop;
    probe.remove();
    await expect(getComputedStyle(canvas.getByTestId("themed")).paddingTop).toBe(expected);
  },
};

export const WithoutCssVariables: Story = {
  args: { withCssVariables: false },
};

function SchemeButtons(props: { of: string }) {
  const { setColorScheme, clearColorScheme } = createColorScheme();
  return (
    <>
      <Button onClick={() => setColorScheme("dark")}>Dark in {props.of}</Button>
      <Button onClick={clearColorScheme}>Clear in {props.of}</Button>
    </>
  );
}

function SchemeOnItsOwnElement(props: { label: string; manager: SolixColorSchemeManager }) {
  let root: HTMLElement | undefined;
  return (
    <section aria-label={props.label} ref={(element: HTMLElement) => (root = element)}>
      <SolixProvider colorSchemeManager={props.manager} getRootElement={() => root}>
        <SchemeButtons of={props.label} />
      </SolixProvider>
    </section>
  );
}

const sharedManager = localStorageColorSchemeManager({ key: "story-shared-color-scheme" });

export const TwoProvidersFollowOneManager: Story = {
  render: () => (
    <>
      <SchemeOnItsOwnElement label="the first" manager={sharedManager} />
      <SchemeOnItsOwnElement label="the second" manager={sharedManager} />
    </>
  ),
  play: async ({ canvas }) => {
    const schemes = () =>
      canvas.getAllByRole("region").map((section) => section.getAttribute(colorSchemeAttribute));

    await userEvent.click(canvas.getByRole("button", { name: "Dark in the first" }));
    await waitFor(() => expect(schemes()).toEqual(["dark", "dark"]));
    await userEvent.click(canvas.getByRole("button", { name: "Clear in the second" }));
    await waitFor(() => expect(schemes()).toEqual(["light", "light"]));
  },
};

function Mounted() {
  const [mounted, setMounted] = createSignal(false);
  const manager = localStorageColorSchemeManager({ key: "story-mounted-color-scheme" });
  return (
    <>
      <Button onClick={() => setMounted((now) => !now)}>Mount or unmount</Button>
      <Show when={mounted()}>
        <SchemeOnItsOwnElement label="the mounted" manager={manager} />
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
