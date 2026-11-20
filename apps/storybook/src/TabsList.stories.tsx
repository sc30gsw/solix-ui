import { Tabs } from "@solix/core";
import { argTypesOf } from "virtual:story-controls";
import type { ComponentMeta, ComponentStory } from "#/story-meta.ts";

const meta = {
  component: Tabs.List,
  argTypes: argTypesOf(Tabs.List),
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
} satisfies ComponentMeta<typeof Tabs.List>;

export default meta;

type Story = ComponentStory<typeof meta>;

export const Default: Story = {};
