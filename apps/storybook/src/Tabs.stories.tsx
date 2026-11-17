import { Tabs } from "@solix/core";
import type { Meta, StoryObj } from "../.storybook/solid";
import { expect, userEvent } from "storybook/test";

const meta = {
  component: Tabs,
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
} satisfies Meta<typeof Tabs>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const ArrowKeys: Story = {
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
