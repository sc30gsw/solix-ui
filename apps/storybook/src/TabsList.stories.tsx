import { Tabs } from "@solix/core";
import type { Meta, StoryObj } from "storybook-solidjs-vite";

const meta = {
  component: Tabs.List,
  args: { "aria-label": "Account" },
  render: (args) => (
    <Tabs defaultValue="profile">
      <Tabs.List {...args}>
        <Tabs.Tab value="profile">Profile</Tabs.Tab>
        <Tabs.Tab value="security">Security</Tabs.Tab>
      </Tabs.List>
      <Tabs.Panel value="profile">Profile panel</Tabs.Panel>
      <Tabs.Panel value="security">Security panel</Tabs.Panel>
    </Tabs>
  ),
} satisfies Meta<typeof Tabs.List>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
