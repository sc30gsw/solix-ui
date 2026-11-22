import { Center, SolixProvider, Tabs, Button } from "@solix/core";
import { render } from "@solidjs/web";
import { createSignal, onSettled } from "solid-js";
import { argTypesOf } from "virtual:story-controls";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import type { ComponentMeta, ComponentStory } from "#/story-meta.ts";

const tabs = (args: Record<string, unknown>, label = "Mail") => (
  <Tabs defaultValue="inbox" {...args}>
    <Tabs.List aria-label={label}>
      <Tabs.Tab value="inbox">Inbox</Tabs.Tab>
      <Tabs.Tab value="drafts">Drafts</Tabs.Tab>
    </Tabs.List>
    <Tabs.Panel value="inbox">Inbox panel</Tabs.Panel>
    <Tabs.Panel value="drafts">Drafts panel</Tabs.Panel>
  </Tabs>
);

const sharedStyle = { "outline-offset": "0px" };
const [late, setLate] = createSignal<"horizontal" | "vertical">("horizontal");
const [early, setEarly] = createSignal<"horizontal" | "vertical">("vertical");

const meta = {
  title: "Probe/Round5",
  component: Tabs,
  argTypes: argTypesOf(Tabs),
  render: (args) => tabs(args),
} satisfies ComponentMeta<typeof Tabs>;

export default meta;

type Story = ComponentStory<typeof meta>;

export const AncestorProvider: Story = {
  render: () => {
    const [root, setRoot] = createSignal<HTMLElement>();
    return (
      <SolixProvider getRootElement={root} forceColorScheme="dark" withCssVariables={false}>
        <section aria-label="Probe root" ref={setRoot}>
          <Button>Go</Button>
        </section>
      </SolixProvider>
    );
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("button", { name: "Go" })).toBeVisible();
  },
};

export const SharedStyleTwoMounts: Story = {
  render: () => (
    <>
      {tabs({ style: sharedStyle }, "First")}
      {tabs({ style: sharedStyle, orientation: "vertical" }, "Second")}
    </>
  ),
  play: async () => {
    await expect(sharedStyle).toBeDefined();
  },
};

export const ReusedObject: Story = {
  render: () => tabs({ style: sharedStyle, orientation: "vertical" }),
  play: async () => {
    await expect(sharedStyle).toBeDefined();
  },
};

export const LateValue: Story = {
  render: () =>
    tabs({
      get orientation() {
        return late();
      },
    }),
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("tablist")).not.toHaveAttribute("aria-orientation", "vertical");
    setLate("vertical");
    await new Promise((resolve) => setTimeout(resolve, 50));
  },
};

export const EarlyValue: Story = {
  render: () =>
    tabs({
      get orientation() {
        return early();
      },
    }),
  play: async ({ canvas }) => {
    setEarly("horizontal");
    await waitFor(() =>
      expect(canvas.getByRole("tablist")).not.toHaveAttribute("aria-orientation", "vertical"),
    );
  },
};

export const TimerFromRender: Story = {
  render: () => {
    let list: HTMLElement | undefined;
    onSettled(() => {
      setTimeout(() => void expect(list?.querySelector('[role="tablist"]')).toBeTruthy(), 20);
    });
    return (
      <div ref={(node) => (list = node)}>{tabs({ orientation: "vertical" })}</div>
    );
  },
  play: async () => {
    await new Promise((resolve) => setTimeout(resolve, 100));
  },
};

export const BeforeTheCanvas: Story = {
  render: () => <p>The canvas</p>,
  play: async () => {
    const outside = document.createElement("div");
    document.body.prepend(outside);
    render(() => <Center inline>Outside the canvas</Center>, outside);
    await expect(outside).toBeVisible();
  },
};

export const NotCalledWhileKeysOnlyMoveFocus: Story = {
  args: { activateTabWithKeyboard: false, onChange: fn() },
  play: async ({ args, canvas }) => {
    await userEvent.click(canvas.getByRole("tab", { name: "Inbox" }));
    await userEvent.keyboard("{ArrowRight}");
    await expect(canvas.getByRole("tab", { name: "Drafts" })).toHaveFocus();
    await expect(args.onChange).not.toHaveBeenCalled();
  },
};

export const NoWrapWithoutLoop: Story = {
  args: { loop: false },
  play: async ({ canvas }) => {
    const list = within(canvas.getByRole("tablist"));
    await userEvent.click(list.getByRole("tab", { name: "Drafts" }));
    await userEvent.keyboard("{ArrowRight}");
    await expect(list.getByRole("tab", { name: "Inbox" })).not.toHaveFocus();
  },
};
