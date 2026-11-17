import { Container } from "@solix/core";
import type { Meta, StoryObj } from "storybook-solidjs-vite";

const meta = {
  component: Container,
  args: { children: "Content held to the container's width" },
} satisfies Meta<typeof Container>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Small: Story = {
  args: { size: "xs" },
};

export const Fluid: Story = {
  args: { fluid: true },
};
