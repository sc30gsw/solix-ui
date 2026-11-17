import { Button } from "@solix/core";
import { createEffect, createSignal } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect } from "storybook/test";

const meta = {
  component: Button,
  tags: ["spike-breaks"],
} satisfies Meta<typeof Button>;

export default meta;

type Story = StoryObj<typeof meta>;

export const AxeViolation: Story = {
  args: { children: undefined },
};

export const TargetTooSmall: Story = {
  render: () => (
    <div>
      <Button
        aria-label="Previous"
        styles={{ root: { height: "12px", width: "12px", padding: "0" } }}
      />
      <Button
        aria-label="Next"
        styles={{ root: { height: "12px", width: "12px", padding: "0" } }}
      />
    </div>
  ),
};

export const PlayFails: Story = {
  args: { children: "Save" },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("button")).toHaveTextContent("Cancel");
  },
};

export const SolidWarning: Story = {
  args: { children: "Save" },
  play: async () => {
    createEffect(
      () => undefined,
      () => undefined,
    );
  },
};

export const SolidDiagnostic: Story = {
  render: () => {
    const [label, setLabel] = createSignal("Save");
    setLabel("Saved");
    return <Button>{label()}</Button>;
  },
};
