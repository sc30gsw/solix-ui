import { Box, Flex } from "@solix/core";
import type { Meta, StoryObj } from "storybook-solidjs-vite";

const meta = {
  component: Flex,
  args: { gap: "md", align: "center" },
  render: (args) => (
    <Flex {...args}>
      <Box>First</Box>
      <Box>Second</Box>
      <Box>Third</Box>
    </Flex>
  ),
} satisfies Meta<typeof Flex>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Row: Story = {};

export const Column: Story = {
  args: { direction: "column" },
};
