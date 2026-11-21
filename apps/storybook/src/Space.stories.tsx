import { Box, Space } from "@solix/core";
import { argTypesOf } from "virtual:story-controls";
import type { ComponentMeta, ComponentStory } from "#/story-meta.ts";

const meta = {
  component: Space,
  argTypes: argTypesOf(Space),
  args: { h: "xl" },
  render: (args) => (
    <>
      <Box>Above the space</Box>
      <Space {...args} />
      <Box>Below the space</Box>
    </>
  ),
} satisfies ComponentMeta<typeof Space>;

export default meta;

type Story = ComponentStory<typeof meta>;

export const Vertical: Story = {};
