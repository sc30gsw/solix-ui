import { Tabs } from "@solix/core";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, userEvent } from "storybook/test";

const meta = {
  component: Tabs.Tab,
  args: { value: "security", children: "Security" },
  render: (args) => (
    <Tabs defaultValue="profile">
      <Tabs.List aria-label="Account">
        <Tabs.Tab value="profile">Profile</Tabs.Tab>
        <Tabs.Tab {...args} />
      </Tabs.List>
      <Tabs.Panel value="profile">Profile panel</Tabs.Panel>
      <Tabs.Panel value="security">Security panel</Tabs.Panel>
    </Tabs>
  ),
} satisfies Meta<typeof Tabs.Tab>;

export default meta;

type Story = StoryObj<typeof meta>;

export const SelectedByAPress: Story = {
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("tab", { name: "Security" }));
    await expect(canvas.getByRole("tabpanel")).toHaveTextContent("Security panel");
  },
};

export const WithSections: Story = {
  args: { leftSection: <span>L</span>, rightSection: <span>R</span> },
};

export const Disabled: Story = {
  args: { disabled: true },
};
