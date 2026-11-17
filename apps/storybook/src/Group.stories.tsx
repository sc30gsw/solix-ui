import { Button, Group } from "@solix/core";
import type { Meta, StoryObj } from "storybook-solidjs-vite";

const meta = {
  component: Group,
  args: { gap: "sm" },
  render: (args) => (
    <Group {...args}>
      <Button>First</Button>
      <Button>Second</Button>
      <Button>Third</Button>
    </Group>
  ),
} satisfies Meta<typeof Group>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Grown: Story = {
  args: { grow: true },
};
