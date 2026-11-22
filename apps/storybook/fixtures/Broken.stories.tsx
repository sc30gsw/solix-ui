import { Button, colorSchemeAttribute } from "@solix/core";
import { createEffect, onCleanup } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect } from "storybook/test";
import { argTypesOf } from "virtual:story-controls";
import { everyValueOf } from "#/every-value.tsx";

const meta = {
  component: Button,
  args: { children: "Save" },
} satisfies Meta<typeof Button>;

export default meta;

type Story = StoryObj<typeof meta>;

const tooSmall = {
  root: { height: "12px", width: "12px", "min-height": "0", "min-width": "0", padding: "0" },
};

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

export const ContrastOutsideTheList: Story = {
  render: () => (
    <div>
      <Button color="blue.6">Given shade</Button>
      <Button variant="subtle" c="yellow-6">
        Pale text
      </Button>
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

const nameless = { children: undefined };

export const AccessibilityTestOff: Story = {
  args: nameless,
  parameters: { a11y: { test: "off" } },
};

export const AccessibilityTestTodo: Story = {
  args: nameless,
  parameters: { a11y: { test: "todo" } },
};

export const AccessibilityDisabled: Story = {
  args: nameless,
  parameters: { a11y: { disable: true } },
};

export const AccessibilityRulesNarrowed: Story = {
  args: nameless,
  parameters: { a11y: { options: { runOnly: ["region"] } } },
};

export const AccessibilityRuleTurnedOff: Story = {
  args: nameless,
  parameters: { a11y: { config: { rules: [{ id: "color-contrast", enabled: false }] } } },
};

export const AccessibilityLeftToAManualRun: Story = {
  args: nameless,
  globals: { a11y: { manual: true } },
};

export const AccessibilitySkippedAsAGhost: Story = {
  args: nameless,
  globals: { ghostStories: true },
};

export const RenderedWhereTheScanDoesNotLook: Story = {
  render: () => (
    <div class="sb-wrapper">
      <Button />
    </div>
  ),
};

export const PlayTurnsTheCheckOff: Story = {
  args: nameless,
  play: async ({ parameters }) => {
    Object.assign(parameters.a11y, { test: "off" });
  },
};

export const NamelessLinkAfterAWrite: Story = {
  render: () => <a href="#after-a-write" />,
};

const withControls = { ...meta, argTypes: argTypesOf(Button) };

const ignoringItsVariant = {
  ...withControls,
  render: (args: Readonly<Record<string, unknown>>) => (
    <Button ref={(element: Element) => element.setAttribute("variant", String(args.variant))}>
      Save
    </Button>
  ),
};

export const VariantOnlyAsAnAttribute = everyValueOf(ignoringItsVariant, "variant");

export const KnownOpenThatNoLongerHolds = everyValueOf(
  withControls,
  "unstyled",
  {},
  {
    knownOpen: { followUp: "a follow-up already merged", alike: [["true", "false"]] },
  },
);

export const SetsTheOtherScheme: Story = {
  play: async () => {
    const page = document.documentElement;
    const other = page.getAttribute(colorSchemeAttribute) === "dark" ? "light" : "dark";
    page.setAttribute(colorSchemeAttribute, other);
  },
};
