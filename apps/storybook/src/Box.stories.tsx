import { Box } from "@solix/core";
import { argTypesOf } from "virtual:story-controls";
import type { ComponentMeta, ComponentStory } from "#/story-meta.ts";

const meta = {
  component: Box,
  argTypes: argTypesOf(Box),
  args: { children: "Content of a box", p: "md" },
} satisfies ComponentMeta<typeof Box>;

export default meta;

type Story = ComponentStory<typeof meta>;

export const Default: Story = {};

export const AsASection: Story = {
  render: (args) => (
    <Box component="section" aria-label="A section box" {...args}>
      Content of a section
    </Box>
  ),
};
