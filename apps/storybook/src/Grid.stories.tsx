import { Box, Button, Grid } from "@solix/core";
import { createMemo, createSignal, Loading, Show } from "solid-js";
import { expect, userEvent, waitFor } from "storybook/test";
import { argTypesOf } from "virtual:story-controls";
import { everyValueOf } from "#/every-value.tsx";
import type { ComponentMeta, ComponentStory } from "#/story-meta.ts";

const meta = {
  component: Grid,
  argTypes: argTypesOf(Grid),
  args: { gap: "md" },
  render: (args) => (
    <Grid {...args}>
      <Grid.Col span={{ base: 12, md: 6 }}>Half from md</Grid.Col>
      <Grid.Col span={{ base: 12, md: 6 }}>Other half from md</Grid.Col>
      <Grid.Col span={4}>A third</Grid.Col>
      <Grid.Col span={4} offset={4}>
        A third after an offset
      </Grid.Col>
    </Grid>
  ),
} satisfies ComponentMeta<typeof Grid>;

export default meta;

type Story = ComponentStory<typeof meta>;

const narrowContainerBreakpoints = {
  xs: "10em",
  sm: "15em",
  md: "20em",
  lg: "25em",
  xl: "30em",
} as const;
const columnLoadingDelay = 50;

function columnRulesBeside(column: Element): number | undefined {
  return column.closest(".solix-Grid-inner")?.querySelectorAll("style[data-solix-rules]").length;
}

function LoadedColumn() {
  const span = createMemo(async () => {
    await new Promise((resolve) => setTimeout(resolve, columnLoadingDelay));
    return 6;
  });
  return <Grid.Col span={{ base: 12, md: span() }}>Loaded column</Grid.Col>;
}

export const Default: Story = {};

export const Grown: Story = {
  args: { grow: true, columns: 24 },
};

export const EveryType: Story = everyValueOf(meta, "type");

export const OnItsContainerWidth: Story = {
  args: {
    type: "container",
    breakpoints: { xs: "20em", sm: "30em", md: "40em", lg: "50em", xl: "60em" },
  },
};

export const DynamicContainerColumns: Story = {
  args: {
    type: "container",
    breakpoints: narrowContainerBreakpoints,
  },
  render: (args) => {
    const [firstResponsive, setFirstResponsive] = createSignal(true);
    const [showFirst, setShowFirst] = createSignal(true);
    return (
      <Box w={480}>
        <Button onClick={() => setFirstResponsive((current) => !current)}>
          Toggle first md span
        </Button>
        <Button onClick={() => setShowFirst((current) => !current)}>Toggle first column</Button>
        <Grid {...args}>
          <Show when={showFirst()}>
            <Grid.Col span={firstResponsive() ? { base: 12, md: 6 } : 12}>First dynamic</Grid.Col>
          </Show>
          <Grid.Col span={{ base: 12, md: 6 }}>Second dynamic</Grid.Col>
        </Grid>
      </Box>
    );
  },
  play: async ({ canvas }) => {
    const first = () => canvas.getByText("First dynamic");
    const second = () => canvas.getByText("Second dynamic");
    const styleCount = () => columnRulesBeside(second());

    await waitFor(async () => {
      await expect(second().getBoundingClientRect().width).toBeLessThan(300);
      await expect(styleCount()).toBe(1);
    });

    const toggleFirstSpan = async (firstWidth: (width: number) => unknown) => {
      await userEvent.click(canvas.getByRole("button", { name: "Toggle first md span" }));
      await waitFor(async () => {
        await firstWidth(first().getBoundingClientRect().width);
        await expect(second().getBoundingClientRect().width).toBeLessThan(300);
        await expect(styleCount()).toBe(1);
      });
    };

    await toggleFirstSpan((width) => expect(width).toBeGreaterThan(400));
    await toggleFirstSpan((width) => expect(width).toBeLessThan(300));

    await userEvent.click(canvas.getByRole("button", { name: "Toggle first column" }));
    await waitFor(async () => {
      await expect(canvas.queryByText("First dynamic")).toBeNull();
      await expect(second().getBoundingClientRect().width).toBeLessThan(300);
      await expect(styleCount()).toBe(1);
    });
  },
};

export const ContainerColumnAfterALoadedOne: Story = {
  args: {
    type: "container",
    breakpoints: narrowContainerBreakpoints,
  },
  render: (args) => (
    <Box w={480}>
      <Grid {...args}>
        <Loading fallback="Loading a column">
          <LoadedColumn />
        </Loading>
        <Grid.Col span={{ base: 12, md: 6 }}>Column after a loaded one</Grid.Col>
      </Grid>
    </Box>
  ),
  play: async ({ canvas }) => {
    const loaded = await canvas.findByText("Loaded column");
    const after = canvas.getByText("Column after a loaded one");

    await waitFor(async () => {
      await expect(loaded.getBoundingClientRect().width).toBeLessThan(300);
      await expect(after.getBoundingClientRect().width).toBeLessThan(300);
      await expect(columnRulesBeside(after)).toBe(1);
    });
  },
};

export const ColumnBesideAHeldOne: Story = {
  args: {
    type: "container",
    breakpoints: narrowContainerBreakpoints,
  },
  render: (args) => {
    const held = Promise.withResolvers<string>();
    const text = createMemo(() => held.promise);
    return (
      <Box w={480}>
        <Button onClick={() => held.resolve("released")}>Release the held column</Button>
        <Grid {...args}>
          <Loading fallback="Holding a column">
            <Grid.Col span={{ base: 12, md: 6 }}>Held column {text()}</Grid.Col>
          </Loading>
          <Grid.Col span={{ base: 12, md: 6 }}>Column beside a held one</Grid.Col>
        </Grid>
      </Box>
    );
  },
  play: async ({ canvas }) => {
    const beside = canvas.getByText("Column beside a held one");

    await waitFor(async () => {
      await expect(beside.getBoundingClientRect().width).toBeLessThan(300);
      await expect(columnRulesBeside(beside)).toBe(1);
    });
    await expect(canvas.queryByText("Holding a column")).not.toBeNull();

    await userEvent.click(canvas.getByRole("button", { name: "Release the held column" }));
    const released = await canvas.findByText("Held column released");
    await waitFor(async () => {
      await expect(canvas.queryByText("Holding a column")).toBeNull();
      await expect(released.getBoundingClientRect().width).toBeLessThan(300);
      await expect(beside.getBoundingClientRect().width).toBeLessThan(300);
      await expect(columnRulesBeside(beside)).toBe(1);
    });
  },
};

export const Aligned: Story = {
  args: {
    rowGap: "xl",
    columnGap: "xs",
    justify: "center",
    align: "flex-start",
    overflow: "hidden",
  },
};

export const EveryGrow: Story = everyValueOf(meta, "grow", { columns: 24 });
