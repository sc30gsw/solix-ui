import { Button, type ButtonProps } from "@solix/core";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, fn, spyOn, userEvent } from "storybook/test";

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
  args: { size: 1, radius: 1, fz: "sm", children: "S" },
  play: async ({ canvas }) => {
    const { width, height } = canvas.getByRole("button", { name: "S" }).getBoundingClientRect();
    await expect(Math.min(width, height)).toBeGreaterThanOrEqual(24);
  },
};

const givenColour = "oklch(0.45 0.15 260)";

export const GivenColors: Story = {
  render: () => (
    <div>
      <Button color="red.6" autoContrast>
        Given shade
      </Button>
      <Button color={givenColour}>Given colour</Button>
    </div>
  ),
  play: async ({ canvas }) => {
    await expect(
      getComputedStyle(canvas.getByRole("button", { name: "Given colour" })).backgroundColor,
    ).toBe(givenColour);
  },
};

const notColours = ["red-6", "bleu", "inherit", "Red"];

function propsWithColor(color: string): ButtonProps {
  const props: ButtonProps = { children: color };
  Reflect.set(props, "color", color);
  return props;
}

export const ColorFallsBack: Story = {
  render: () => (
    <div>
      {notColours.map((color) => (
        <Button {...propsWithColor(color)} />
      ))}
    </div>
  ),
  beforeEach: () => {
    const warnings = spyOn(globalThis.console, "warn").mockImplementation(() => undefined);
    return () => warnings.mockRestore();
  },
  play: async ({ canvas }) => {
    for (const color of notColours) {
      await expect(globalThis.console.warn).toHaveBeenCalledWith(
        expect.stringContaining(`"${color}"`),
      );
      await expect(
        getComputedStyle(canvas.getByRole("button", { name: color })).backgroundColor,
      ).toBe(getComputedStyle(canvas.getByRole("button", { name: notColours[0] })).backgroundColor);
    }
  },
};
