import { Box, Stack } from "@solix/core";
import { argTypesOf } from "virtual:story-controls";
import type { ComponentMeta, ComponentStory } from "#/story-meta.ts";

const meta = {
  component: Stack,
  argTypes: argTypesOf(Stack),
  args: { gap: "md" },
  render: (args) => (
    <Stack {...args}>
      <Box>First</Box>
      <Box>Second</Box>
      <Box>Third</Box>
    </Stack>
  ),
} satisfies ComponentMeta<typeof Stack>;

export default meta;

type Story = ComponentStory<typeof meta>;

export const Default: Story = {};

export const Centred: Story = {
  args: { align: "center" },
};
