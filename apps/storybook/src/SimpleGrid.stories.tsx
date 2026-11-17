import { Box, SimpleGrid } from "@solix/core";
import type { Meta, StoryObj } from "storybook-solidjs-vite";

const meta = {
  component: SimpleGrid,
  args: { cols: 3, spacing: "md" },
  render: (args) => (
    <SimpleGrid {...args}>
      <Box>One</Box>
      <Box>Two</Box>
      <Box>Three</Box>
      <Box>Four</Box>
    </SimpleGrid>
  ),
} satisfies Meta<typeof SimpleGrid>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Responsive: Story = {
  args: { cols: { base: 1, sm: 2, lg: 4 } },
};
