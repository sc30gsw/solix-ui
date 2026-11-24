import { Box, Stack } from "@solix/core";
import { argTypesOf } from "virtual:story-controls";
import {
  everyBreakpointValueAt,
  everyValueOf,
  keywordsReachOnlyTheCustomProperty,
  keywordsResetAPropertyThatIsNotInherited,
} from "#/every-value.tsx";
import type { ComponentMeta, ComponentStory } from "#/story-meta.ts";

const meta = {
  title: "Common props",
  component: Box,
  argTypes: argTypesOf(Box),
  args: { children: "A box" },
} satisfies ComponentMeta<typeof Box>;

export default meta;

type Story = ComponentStory<typeof meta>;

const outlined = { outline: "1px dashed currentColor" };

export const Margin: Story = {
  render: () => (
    <Stack gap={0} style={outlined}>
      <Box m="md">m</Box>
      <Box mx="xl">mx</Box>
      <Box my="xs">my</Box>
      <Box mt="sm">mt</Box>
      <Box mb="sm">mb</Box>
      <Box ml="lg">ml</Box>
      <Box mr="lg">mr</Box>
      <Box ms="md">ms</Box>
      <Box me="md">me</Box>
      <Box mis={24}>mis</Box>
      <Box mie="1.5rem">mie</Box>
    </Stack>
  ),
};

export const Padding: Story = {
  render: () => (
    <Stack gap="xs">
      <Box p="md" style={outlined}>
        p
      </Box>
      <Box px="xl" style={outlined}>
        px
      </Box>
      <Box py="xs" style={outlined}>
        py
      </Box>
      <Box pt="sm" style={outlined}>
        pt
      </Box>
      <Box pb="sm" style={outlined}>
        pb
      </Box>
      <Box pl="lg" style={outlined}>
        pl
      </Box>
      <Box pr="lg" style={outlined}>
        pr
      </Box>
      <Box ps="md" style={outlined}>
        ps
      </Box>
      <Box pe="md" style={outlined}>
        pe
      </Box>
      <Box pis={24} style={outlined}>
        pis
      </Box>
      <Box pie="1.5rem" style={outlined}>
        pie
      </Box>
    </Stack>
  ),
};

export const Size: Story = {
  render: () => (
    <Stack gap="xs">
      <Box w={160} style={outlined}>
        w
      </Box>
      <Box miw="12rem" style={outlined}>
        miw
      </Box>
      <Box maw="50%" style={outlined}>
        maw
      </Box>
      <Box h={48} style={outlined}>
        h
      </Box>
      <Box mih="4rem" style={outlined}>
        mih
      </Box>
      <Box mah={40} style={{ ...outlined, overflow: "auto" }}>
        mah
      </Box>
    </Stack>
  ),
};

export const Colour: Story = {
  render: () => (
    <Stack gap="xs">
      <Box c="#1a1b1e" bg="#f1f3f5" p="xs">
        c and bg
      </Box>
      <Box
        c="#1a1b1e"
        bg="linear-gradient(#e7f5ff, #d0ebff)"
        bgsz="100% 200%"
        bgp="top"
        bgr="no-repeat"
        bga="scroll"
        p="xs"
      >
        bgsz, bgp, bgr and bga
      </Box>
      <Box opacity={0.95}>opacity</Box>
    </Stack>
  ),
};

export const Typography: Story = {
  render: () => (
    <Stack gap="xs">
      <Box ff="monospace">ff</Box>
      <Box fz="lg">fz</Box>
      <Box fw={700}>fw</Box>
      <Box lts="0.1em">lts</Box>
      <Box ta="center">ta</Box>
      <Box lh="xl">lh</Box>
      <Box fs="italic">fs</Box>
      <Box tt="uppercase">tt</Box>
      <Box td="underline">td</Box>
    </Stack>
  ),
};

export const Border: Story = {
  render: () => (
    <Stack gap="xs">
      <Box bd="1px solid #495057" p="xs">
        bd
      </Box>
      <Box bd="1px solid #495057" bdrs="md" p="xs">
        bdrs
      </Box>
    </Stack>
  ),
};

export const Position: Story = {
  render: () => (
    <Box pos="relative" h={160} style={outlined}>
      <Box pos="absolute" inset="auto 0 0 auto">
        inset
      </Box>
      <Box pos="absolute" top={8} left={8}>
        top and left
      </Box>
      <Box pos="absolute" bottom={8} left={8}>
        bottom
      </Box>
      <Box pos="absolute" top={8} right={8}>
        right
      </Box>
    </Box>
  ),
};

export const Layout: Story = {
  render: () => (
    <Box display="flex" style={outlined}>
      <Box flex="1">flex 1</Box>
      <Box flex="2">flex 2</Box>
    </Box>
  ),
};

export const Visibility: Story = {
  render: () => (
    <Stack gap="xs">
      <Box hiddenFrom="md">hiddenFrom md</Box>
      <Box visibleFrom="md">visibleFrom md</Box>
      <Box lightHidden>lightHidden: shown in the dark scheme</Box>
      <Box darkHidden>darkHidden: shown in the light scheme</Box>
    </Stack>
  ),
};

export const ConsumerStyling: Story = {
  render: () => (
    <Stack gap="xs">
      <Box class="consumer-class" style={outlined}>
        class and style
      </Box>
      <Box classes={{ root: "consumer-root" }} styles={{ root: outlined }}>
        classes and styles
      </Box>
      <Box unstyled>unstyled</Box>
    </Stack>
  ),
};

export const EveryTextAlign: Story = everyValueOf(meta, "ta", {
  within: { "text-align": "center" },
  alike: [
    {
      values: ["center", "inherit", "unset", "revert", "revert-layer", "match-parent"],
      because: { kind: "design", reason: "text-align is inherited, so each takes the parent's" },
    },
    {
      values: ["center", "-webkit-match-parent", "match-parent"],
      because: { kind: "design", reason: "-webkit-match-parent is match-parent in every engine" },
    },
    {
      values: ["center", "-khtml-center", "-khtml-left", "-khtml-right"],
      because: { kind: "design", reason: "no engine reads a -khtml- value, so the parent's stays" },
    },
    { values: ["center", "initial", "-moz-initial"], because: keywordsReachOnlyTheCustomProperty },
    {
      values: ["center", "-moz-center", "-moz-left", "-moz-right"],
      because: {
        kind: "engine",
        engines: ["chromium", "webkit"],
        reason: "a -moz- value is not read, so the parent's stays",
      },
    },
    ...(["center", "left", "right"] as const).map((side) => ({
      values: [`-moz-${side}`, `-webkit-${side}`] as const,
      because: {
        kind: "engine",
        engines: ["firefox"],
        reason: "each -moz- value is read as its -webkit- one",
      } as const,
    })),
  ],
});

export const EveryPosition: Story = everyValueOf(meta, "pos", {
  within: { position: "relative" },
  alike: [
    {
      values: ["static", "initial", "unset", "revert", "revert-layer", "-moz-initial"],
      because: keywordsResetAPropertyThatIsNotInherited,
    },
    { values: ["inherit", "static"], because: keywordsReachOnlyTheCustomProperty },
    {
      values: ["static", "-webkit-sticky"],
      because: {
        kind: "engine",
        engines: ["chromium", "firefox"],
        reason: "-webkit-sticky is not read, so the position stays static",
      },
    },
    {
      values: ["sticky", "-webkit-sticky"],
      because: { kind: "engine", engines: ["webkit"], reason: "-webkit-sticky is read as sticky" },
    },
  ],
});

export const EveryHiddenFromAt672px: Story = everyBreakpointValueAt(meta, "hiddenFrom", 672);

export const EveryHiddenFromAt880px: Story = everyBreakpointValueAt(meta, "hiddenFrom", 880);

export const EveryHiddenFromAt1096px: Story = everyBreakpointValueAt(meta, "hiddenFrom", 1096);

export const EveryHiddenFromAt1304px: Story = everyBreakpointValueAt(meta, "hiddenFrom", 1304);

export const EveryVisibleFromAt672px: Story = everyBreakpointValueAt(meta, "visibleFrom", 672);

export const EveryVisibleFromAt880px: Story = everyBreakpointValueAt(meta, "visibleFrom", 880);

export const EveryVisibleFromAt1096px: Story = everyBreakpointValueAt(meta, "visibleFrom", 1096);

export const EveryVisibleFromAt1304px: Story = everyBreakpointValueAt(meta, "visibleFrom", 1304);

export const EveryLightHidden: Story = everyValueOf(meta, "lightHidden", {
  alike: [
    {
      values: ["true", "false"],
      because: { kind: "scheme", scheme: "dark", reason: "lightHidden hides nothing there" },
    },
  ],
});

export const EveryDarkHidden: Story = everyValueOf(meta, "darkHidden", {
  alike: [
    {
      values: ["true", "false"],
      because: { kind: "scheme", scheme: "light", reason: "darkHidden hides nothing there" },
    },
  ],
});
