import { Grid } from "@solix/core";
import { argTypesOf } from "virtual:story-controls";
import type { ComponentMeta, ComponentStory } from "#/story-meta.ts";

const meta = {
  component: Grid,
  argTypes: argTypesOf(Grid),
  args: { gap: "md" },
  render: (args) => (
    <Grid {...args}>
      <Grid.Col span={{ base: 12, md: 6 }}>Half from md</Grid.Col>
      <Grid.Col span={{ base: 12, md: 6 }}>Other half from md</Grid.Col>
      <Grid.Col span={4}>A third</Grid.Col>
      <Grid.Col span={4} offset={4}>
        A third after an offset
      </Grid.Col>
    </Grid>
  ),
} satisfies ComponentMeta<typeof Grid>;

export default meta;

type Story = ComponentStory<typeof meta>;

export const Default: Story = {};

export const Grown: Story = {
  args: { grow: true, columns: 24 },
};
