import { Box, Flex } from "@solix/core";
import { argTypesOf } from "virtual:story-controls";
import { everyValueOf } from "#/every-value.tsx";
import type { ComponentMeta, ComponentStory } from "#/story-meta.ts";

const meta = {
  component: Flex,
  argTypes: argTypesOf(Flex),
  args: { gap: "md", align: "center" },
  render: (args) => (
    <Flex {...args}>
      <Box>First</Box>
      <Box>Second</Box>
      <Box>Third</Box>
    </Flex>
  ),
} satisfies ComponentMeta<typeof Flex>;

export default meta;

type Story = ComponentStory<typeof meta>;

export const Row: Story = {};

export const Column: Story = {
  args: { direction: "column" },
};

export const WrappedInASection: Story = {
  render: () => (
    <Flex
      component="section"
      aria-label="Wrapped items"
      wrap="wrap"
      rowGap="xs"
      columnGap="xl"
      justify="space-between"
    >
      <Box>First</Box>
      <Box>Second</Box>
      <Box>Third</Box>
    </Flex>
  ),
};

export const EveryWrap: Story = everyValueOf(meta, "wrap");

export const EveryDirection: Story = everyValueOf(meta, "direction");
