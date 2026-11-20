import { Grid } from "@solix/core";
import { argTypesOf } from "virtual:story-controls";
import type { ComponentMeta, ComponentStory } from "#/story-meta.ts";

const meta = {
  component: Grid.Col,
  argTypes: argTypesOf(Grid.Col),
  args: { span: 6, children: "A column of six" },
  render: (args) => (
    <Grid>
      <Grid.Col {...args} />
      <Grid.Col span="auto">The rest</Grid.Col>
    </Grid>
  ),
} satisfies ComponentMeta<typeof Grid.Col>;

export default meta;

type Story = ComponentStory<typeof meta>;

export const Default: Story = {};

export const Offset: Story = {
  args: { span: 4, offset: 2 },
};

export const Content: Story = {
  args: { span: "content" },
};
