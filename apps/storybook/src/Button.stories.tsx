import { Button, type ButtonProps } from "@solix/core";
import { argTypesOf } from "virtual:story-controls";
import { expect, fn, spyOn, userEvent } from "storybook/test";
import { everyValueOf } from "#/every-value.tsx";
import type { ComponentMeta, ComponentStory } from "#/story-meta.ts";

const meta = {
  component: Button,
  argTypes: argTypesOf(Button),
  args: { children: "Save", onClick: fn() },
} satisfies ComponentMeta<typeof Button>;

export default meta;

type Story = ComponentStory<typeof meta>;

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
      <Button autoContrast={false}>Primary without auto contrast</Button>
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

export const EveryVariant: Story = everyValueOf(meta, "variant");

export const AsALink: Story = {
  render: () => (
    <Button component="a" href="#as-a-link">
      Go
    </Button>
  ),
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("link", { name: "Go" })).toHaveAttribute("href", "#as-a-link");
  },
};

export const EveryUnstyled: Story = everyValueOf(meta, "unstyled");

const withTheDisabledAttribute = {
  ...meta,
  argTypes: { ...meta.argTypes, disabled: { control: { type: "boolean" } } },
};

export const EveryDisabled: Story = everyValueOf(
  withTheDisabledAttribute,
  "disabled",
  {},
  {
    knownOpen: {
      followUp: "Button's spec pull request gives a disabled button its own look (Q182)",
      alike: [["true", "false"]],
    },
  },
);
