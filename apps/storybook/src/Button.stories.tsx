import { Button } from "@solix/core";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, fn, userEvent } from "storybook/test";

const meta = {
  component: Button,
  args: { children: "Save", onClick: fn() },
} satisfies Meta<typeof Button>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Pressed: Story = {
  play: async ({ args, canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Save" }));
    await expect(args.onClick).toHaveBeenCalledOnce();
  },
};

export const Disabled: Story = {
  args: { disabled: true },
  play: async ({ args, canvas }) => {
    await expect(canvas.getByRole("button", { name: "Save" })).toBeDisabled();
    await expect(args.onClick).not.toHaveBeenCalled();
  },
};

export const NeverBelowTheTargetSize: Story = {
  args: { size: 1, radius: 1, children: "S" },
  play: async ({ canvas }) => {
    const { width, height } = canvas.getByRole("button", { name: "S" }).getBoundingClientRect();
    await expect(Math.min(width, height)).toBeGreaterThanOrEqual(24);
  },
};
