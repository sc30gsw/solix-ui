import { Tabs } from "@solix/core";
import { argTypesOf } from "virtual:story-controls";
import { expect, userEvent } from "storybook/test";
import type { ComponentMeta, ComponentStory } from "#/story-meta.ts";

const meta = {
  component: Tabs.Panel,
  argTypes: argTypesOf(Tabs.Panel),
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
} satisfies ComponentMeta<typeof Tabs.Panel>;

export default meta;

type Story = ComponentStory<typeof meta>;

export const Selected: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("tabpanel", { name: "Profile" })).toHaveTextContent(
      "Profile panel",
    );
  },
};

export const KeptMountedWhileHidden: Story = {
  args: { keepMounted: true },
  render: (args) => (
    <Tabs defaultValue="security" keepMounted={false}>
      <Tabs.List aria-label="Account">
        <Tabs.Tab value="profile">Profile</Tabs.Tab>
        <Tabs.Tab value="security">Security</Tabs.Tab>
      </Tabs.List>
      <Tabs.Panel {...args} />
      <Tabs.Panel value="security">Security panel</Tabs.Panel>
    </Tabs>
  ),
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Profile panel")).not.toBeVisible();
  },
};

export const UnmountedWhileHidden: Story = {
  args: { keepMounted: false },
  render: (args) => (
    <Tabs defaultValue="security" keepMounted={false}>
      <Tabs.List aria-label="Account">
        <Tabs.Tab value="profile">Profile</Tabs.Tab>
        <Tabs.Tab value="security">Security</Tabs.Tab>
      </Tabs.List>
      <Tabs.Panel {...args} />
      <Tabs.Panel value="security">Security panel</Tabs.Panel>
    </Tabs>
  ),
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("tabpanel", { name: "Security" })).toBeVisible();
    await expect(canvas.queryByText("Profile panel")).toBeNull();
    await userEvent.click(canvas.getByRole("tab", { name: "Profile" }));
    await expect(canvas.getByText("Profile panel")).toBeVisible();
  },
};
