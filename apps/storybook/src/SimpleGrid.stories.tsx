import { Box, SimpleGrid } from "@solix/core";
import { argTypesOf } from "virtual:story-controls";
import { everyValueOf } from "#/every-value.tsx";
import type { ComponentMeta, ComponentStory } from "#/story-meta.ts";

const meta = {
  component: SimpleGrid,
  argTypes: argTypesOf(SimpleGrid),
  args: { cols: 3, spacing: "md" },
  render: (args) => (
    <SimpleGrid {...args}>
      <Box>One</Box>
      <Box>Two</Box>
      <Box>Three</Box>
      <Box>Four</Box>
    </SimpleGrid>
  ),
} satisfies ComponentMeta<typeof SimpleGrid>;

export default meta;

type Story = ComponentStory<typeof meta>;

export const Default: Story = {};

export const Responsive: Story = {
  args: { cols: { base: 1, sm: 2, lg: 4 } },
};

export const EveryType: Story = everyValueOf(meta, "type");

export const EveryAutoFlow: Story = everyValueOf(meta, "autoFlow", {
  args: { minColWidth: "6rem" },
});

export const FitsColumnsToItsWidth: Story = {
  args: { minColWidth: "8rem", autoRows: "4rem", verticalSpacing: "lg" },
};
