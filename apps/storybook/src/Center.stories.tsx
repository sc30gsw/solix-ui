import { Center } from "@solix/core";
import { argTypesOf } from "virtual:story-controls";
import { everyValueOf } from "#/every-value.tsx";
import type { ComponentMeta, ComponentStory } from "#/story-meta.ts";

const meta = {
  component: Center,
  argTypes: argTypesOf(Center),
  args: { children: "Centred content", h: 120 },
} satisfies ComponentMeta<typeof Center>;

export default meta;

type Story = ComponentStory<typeof meta>;

export const Default: Story = {};

export const Inline: Story = {
  args: { inline: true },
};

export const AsASpan: Story = {
  render: () => (
    <Center component="span" inline>
      Centred in a span
    </Center>
  ),
};

export const EveryInline: Story = everyValueOf(meta, "inline");
