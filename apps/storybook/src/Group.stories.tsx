import { Button, Group } from "@solix/core";
import { argTypesOf } from "virtual:story-controls";
import { everyValueOf } from "#/every-value.tsx";
import type { ComponentMeta, ComponentStory } from "#/story-meta.ts";

const meta = {
  component: Group,
  argTypes: argTypesOf(Group),
  args: { gap: "sm" },
  render: (args) => (
    <Group {...args}>
      <Button>First</Button>
      <Button>Second</Button>
      <Button>Third</Button>
    </Group>
  ),
} satisfies ComponentMeta<typeof Group>;

export default meta;

type Story = ComponentStory<typeof meta>;

export const Default: Story = {};

export const Grown: Story = {
  args: { grow: true },
};

export const EveryWrap: Story = everyValueOf(meta, "wrap");

export const KeptToItsShare: Story = {
  args: { grow: true, preventGrowOverflow: true, justify: "center", align: "flex-end" },
};
