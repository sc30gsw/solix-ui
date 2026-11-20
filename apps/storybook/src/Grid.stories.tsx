import { Grid } from "@solix/core";
import { argTypesOf } from "virtual:story-controls";
import { everyValueOf } from "#/every-value.tsx";
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

export const EveryType: Story = everyValueOf(meta, "type");

export const OnItsContainerWidth: Story = {
  args: {
    type: "container",
    breakpoints: { xs: "20em", sm: "30em", md: "40em", lg: "50em", xl: "60em" },
  },
};

export const Aligned: Story = {
  args: {
    rowGap: "xl",
    columnGap: "xs",
    justify: "center",
    align: "flex-start",
    overflow: "hidden",
  },
};

export const EveryGrow: Story = everyValueOf(meta, "grow", { columns: 24 });
