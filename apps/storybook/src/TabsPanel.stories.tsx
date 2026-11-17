import { Tabs } from "@solix/core";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect } from "storybook/test";

const meta = {
  component: Tabs.Panel,
  args: { value: "profile", children: "Profile panel" },
  render: (args) => (
    <Tabs defaultValue="profile">
      <Tabs.List aria-label="Account">
        <Tabs.Tab value="profile">Profile</Tabs.Tab>
        <Tabs.Tab value="security">Security</Tabs.Tab>
      </Tabs.List>
      <Tabs.Panel {...args} />
      <Tabs.Panel value="security">Security panel</Tabs.Panel>
    </Tabs>
  ),
} satisfies Meta<typeof Tabs.Panel>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Selected: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("tabpanel", { name: "Profile" })).toHaveTextContent(
      "Profile panel",
    );
  },
};
