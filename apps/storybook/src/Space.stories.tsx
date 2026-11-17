import { Box, Space } from "@solix/core";
import type { Meta, StoryObj } from "storybook-solidjs-vite";

const meta = {
  component: Space,
  args: { h: "xl" },
  render: (args) => (
    <>
      <Box>Above the space</Box>
      <Space {...args} />
      <Box>Below the space</Box>
    </>
  ),
} satisfies Meta<typeof Space>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Vertical: Story = {};
