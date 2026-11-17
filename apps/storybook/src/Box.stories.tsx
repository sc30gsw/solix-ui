import { Box } from "@solix/core";
import type { Meta, StoryObj } from "storybook-solidjs-vite";

const meta = {
  component: Box,
  args: { children: "Content of a box", p: "md" },
} satisfies Meta<typeof Box>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const AsASection: Story = {
  render: (args) => (
    <Box component="section" aria-label="A section box" {...args}>
      Content of a section
    </Box>
  ),
};
