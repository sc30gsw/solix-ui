import { Container } from "@solix/core";
import { argTypesOf } from "virtual:story-controls";
import type { ComponentMeta, ComponentStory } from "#/story-meta.ts";

const meta = {
  component: Container,
  argTypes: argTypesOf(Container),
  args: { children: "Content held to the container's width" },
} satisfies ComponentMeta<typeof Container>;

export default meta;

type Story = ComponentStory<typeof meta>;

export const Default: Story = {};

export const Small: Story = {
  args: { size: "xs" },
};

export const Fluid: Story = {
  args: { fluid: true },
};
