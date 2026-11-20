import { Tabs } from "@solix/core";
import { argTypesOf } from "virtual:story-controls";
import { expect, fn, userEvent } from "storybook/test";
import { everyValueOf } from "#/every-value.tsx";
import type { ComponentMeta, ComponentStory } from "#/story-meta.ts";

const meta = {
  component: Tabs,
  argTypes: argTypesOf(Tabs),
  args: { defaultValue: "inbox" },
  render: (args) => (
    <Tabs {...args}>
      <Tabs.List aria-label="Mail">
        <Tabs.Tab value="inbox">Inbox</Tabs.Tab>
        <Tabs.Tab value="drafts">Drafts</Tabs.Tab>
        <Tabs.Tab value="sent" disabled>
          Sent
        </Tabs.Tab>
      </Tabs.List>
      <Tabs.Panel value="inbox">Inbox panel</Tabs.Panel>
      <Tabs.Panel value="drafts">Drafts panel</Tabs.Panel>
      <Tabs.Panel value="sent">Sent panel</Tabs.Panel>
    </Tabs>
  ),
} satisfies ComponentMeta<typeof Tabs>;

export default meta;

type Story = ComponentStory<typeof meta>;

export const Default: Story = {};

export const ArrowKeysMoveTheSelection: Story = {
  args: { activateTabWithKeyboard: true },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("tab", { name: "Inbox" }));
    await userEvent.keyboard("{ArrowRight}");
    await expect(canvas.getByRole("tab", { name: "Drafts" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(canvas.getByRole("tabpanel")).toHaveTextContent("Drafts panel");
  },
};

export const Vertical: Story = {
  args: { orientation: "vertical" },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("tab", { name: "Inbox" }));
    await userEvent.keyboard("{ArrowDown}");
    await expect(canvas.getByRole("tab", { name: "Drafts" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(canvas.getByRole("tablist")).toHaveAttribute("aria-orientation", "vertical");
  },
};

export const Horizontal: Story = {
  args: { orientation: "horizontal" },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("tab", { name: "Inbox" }));
    await userEvent.keyboard("{ArrowRight}");
    await expect(canvas.getByRole("tab", { name: "Drafts" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await userEvent.keyboard("{ArrowDown}");
    await expect(canvas.getByRole("tab", { name: "Drafts" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  },
};

export const EveryOrientation: Story = everyValueOf(meta, "orientation");

export const ControlledByItsValue: Story = {
  args: { value: "drafts", onChange: fn() },
  play: async ({ args, canvas }) => {
    await userEvent.click(canvas.getByRole("tab", { name: "Inbox" }));
    await expect(args.onChange).toHaveBeenCalledWith("inbox");
    await expect(canvas.getByRole("tab", { name: "Drafts" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  },
};

export const WrapsToTheFirstTab: Story = {
  args: { loop: true },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("tab", { name: "Drafts" }));
    await userEvent.keyboard("{ArrowRight}");
    await expect(canvas.getByRole("tab", { name: "Inbox" })).toHaveFocus();
  },
};

export const StopsAtTheLastTabWithoutLoop: Story = {
  args: { loop: false },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("tab", { name: "Drafts" }));
    await userEvent.keyboard("{ArrowRight}");
    await expect(canvas.getByRole("tab", { name: "Drafts" })).toHaveFocus();
  },
};

export const SelectsOnlyOnEnterWithoutActivation: Story = {
  args: { activateTabWithKeyboard: false },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("tab", { name: "Inbox" }));
    await userEvent.keyboard("{ArrowRight}");
    await expect(canvas.getByRole("tab", { name: "Drafts" })).toHaveFocus();
    await expect(canvas.getByRole("tab", { name: "Inbox" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await userEvent.keyboard("{Enter}");
    await expect(canvas.getByRole("tab", { name: "Drafts" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  },
};

export const DeselectedByAPressOnTheSelectedTab: Story = {
  args: { allowTabDeactivation: true },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("tab", { name: "Inbox" }));
    await expect(canvas.getByRole("tab", { name: "Inbox" })).toHaveAttribute(
      "aria-selected",
      "false",
    );
  },
};

export const KeepsHiddenPanelsMounted: Story = {
  args: { keepMounted: true },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Drafts panel")).not.toBeVisible();
  },
};

export const UnmountsHiddenPanels: Story = {
  args: { keepMounted: false },
  play: async ({ canvas }) => {
    await expect(canvas.queryByText("Drafts panel")).toBeNull();
  },
};

export const KeepsTheSelectedTabOnAPress: Story = {
  args: { allowTabDeactivation: false },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("tab", { name: "Inbox" }));
    await expect(canvas.getByRole("tab", { name: "Inbox" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  },
};
