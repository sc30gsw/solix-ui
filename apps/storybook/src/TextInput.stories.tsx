import { TextInput } from "@solix/core";
import { argTypesOf } from "virtual:story-controls";
import { expect, userEvent } from "storybook/test";
import type { ComponentMeta, ComponentStory } from "#/story-meta.ts";

const meta = {
  component: TextInput,
  argTypes: argTypesOf(TextInput),
  args: { "aria-label": "Email", type: "email", placeholder: "you@example.com" },
} satisfies ComponentMeta<typeof TextInput>;

export default meta;

type Story = ComponentStory<typeof meta>;

export const Default: Story = {};

export const Typed: Story = {
  play: async ({ canvas }) => {
    const input = canvas.getByRole("textbox", { name: "Email" });
    await userEvent.type(input, "someone@example.com");
    await expect(input).toHaveValue("someone@example.com");
  },
};

export const Disabled: Story = {
  args: { disabled: true },
};
