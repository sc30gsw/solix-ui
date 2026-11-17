import { Button } from "@solix/core";
import { createEffect, onCleanup } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect } from "storybook/test";

const meta = {
  component: Button,
  args: { children: "Save" },
} satisfies Meta<typeof Button>;

export default meta;

type Story = StoryObj<typeof meta>;

const tooSmall = { root: { height: "12px", width: "12px", padding: "0" } };

export const NoAccessibleName: Story = {
  args: { children: undefined },
};

export const TargetTooSmall: Story = {
  render: () => (
    <div>
      <Button aria-label="Previous" styles={tooSmall} />
      <Button aria-label="Next" styles={tooSmall} />
    </div>
  ),
};

export const PlayFunctionFails: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("button")).toHaveTextContent("Cancel");
  },
};

export const EffectWithoutOwner: Story = {
  play: async () => {
    createEffect(
      () => undefined,
      () => undefined,
    );
  },
};

export const CleanupWithoutOwner: Story = {
  play: async () => {
    onCleanup(() => undefined);
  },
};
