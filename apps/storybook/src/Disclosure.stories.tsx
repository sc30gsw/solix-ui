import { Disclosure } from "@solix/core";
import { argTypesOf } from "virtual:story-controls";
import { expect, userEvent } from "storybook/test";
import type { ComponentMeta, ComponentStory } from "#/story-meta.ts";

const meta = {
  component: Disclosure,
  argTypes: argTypesOf(Disclosure),
  args: { label: "Details", children: "Content shown when open" },
} satisfies ComponentMeta<typeof Disclosure>;

export default meta;

type Story = ComponentStory<typeof meta>;

export const Closed: Story = {};

export const OpenedByItsSummary: Story = {
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByText("Details"));
    await expect(canvas.getByText("Content shown when open")).toBeVisible();
  },
};
