import { Grid } from "@solix/core";
import type { Meta, StoryObj } from "storybook-solidjs-vite";

const meta = {
  component: Grid.Col,
  args: { span: 6, children: "A column of six" },
  render: (args) => (
    <Grid>
      <Grid.Col {...args} />
      <Grid.Col span="auto">The rest</Grid.Col>
    </Grid>
  ),
} satisfies Meta<typeof Grid.Col>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Offset: Story = {
  args: { span: 4, offset: 2 },
};

export const Content: Story = {
  args: { span: "content" },
};
