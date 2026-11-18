import { Box, createTheme, isColorScheme, type SolixColorScheme, SolixProvider } from "@solix/core";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect } from "storybook/test";

const themedPadding = "3rem";

function schemeOfThePage(): SolixColorScheme | undefined {
  const scheme = document.documentElement.getAttribute("data-color-scheme");
  return isColorScheme(scheme) ? scheme : undefined;
}

const meta = {
  component: SolixProvider,
  args: { theme: createTheme({ spacing: { md: themedPadding } }) },
  render: (args) => (
    <SolixProvider defaultColorScheme={schemeOfThePage()} {...args}>
      <Box p="md" data-testid="themed">
        Padded by the theme's md spacing
      </Box>
    </SolixProvider>
  ),
} satisfies Meta<typeof SolixProvider>;

export default meta;

type Story = StoryObj<typeof meta>;

export const ThemedSpacing: Story = {
  play: async ({ canvas }) => {
    const probe = document.createElement("div");
    probe.style.paddingTop = themedPadding;
    document.body.append(probe);
    const expected = getComputedStyle(probe).paddingTop;
    probe.remove();
    await expect(getComputedStyle(canvas.getByTestId("themed")).paddingTop).toBe(expected);
  },
};

export const WithoutCssVariables: Story = {
  args: { withCssVariables: false },
};
