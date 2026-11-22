import { Box, Stack } from "@solix/core";
import { argTypesOf } from "virtual:story-controls";
import { cssWideKeywords, everyValueOf } from "#/every-value.tsx";
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

export const EveryTextAlign: Story = everyValueOf(meta, "ta", {}, { rendersAs: cssWideKeywords });

export const EveryPosition: Story = everyValueOf(meta, "pos", {}, { rendersAs: cssWideKeywords });

const breakpointsAlikeAt = {
  700: [["sm", "md", "lg", "xl"]],
  900: [
    ["xs", "sm"],
    ["md", "lg", "xl"],
  ],
  1100: [
    ["xs", "sm", "md"],
    ["lg", "xl"],
  ],
  1300: [["xs", "sm", "md", "lg"]],
} as const;

export const EveryHiddenFromAt700px: Story = everyValueOf(
  meta,
  "hiddenFrom",
  {},
  {
    atWidth: { width: 700, alike: breakpointsAlikeAt[700] },
  },
);

export const EveryHiddenFromAt900px: Story = everyValueOf(
  meta,
  "hiddenFrom",
  {},
  {
    atWidth: { width: 900, alike: breakpointsAlikeAt[900] },
  },
);

export const EveryHiddenFromAt1100px: Story = everyValueOf(
  meta,
  "hiddenFrom",
  {},
  {
    atWidth: { width: 1100, alike: breakpointsAlikeAt[1100] },
  },
);

export const EveryHiddenFromAt1300px: Story = everyValueOf(
  meta,
  "hiddenFrom",
  {},
  {
    atWidth: { width: 1300, alike: breakpointsAlikeAt[1300] },
  },
);

export const EveryVisibleFromAt700px: Story = everyValueOf(
  meta,
  "visibleFrom",
  {},
  {
    atWidth: { width: 700, alike: breakpointsAlikeAt[700] },
  },
);

export const EveryVisibleFromAt900px: Story = everyValueOf(
  meta,
  "visibleFrom",
  {},
  {
    atWidth: { width: 900, alike: breakpointsAlikeAt[900] },
  },
);

export const EveryVisibleFromAt1100px: Story = everyValueOf(
  meta,
  "visibleFrom",
  {},
  {
    atWidth: { width: 1100, alike: breakpointsAlikeAt[1100] },
  },
);

export const EveryVisibleFromAt1300px: Story = everyValueOf(
  meta,
  "visibleFrom",
  {},
  {
    atWidth: { width: 1300, alike: breakpointsAlikeAt[1300] },
  },
);

export const EveryLightHidden: Story = everyValueOf(
  meta,
  "lightHidden",
  {},
  {
    inScheme: { dark: [["true", "false"]] },
  },
);

export const EveryDarkHidden: Story = everyValueOf(
  meta,
  "darkHidden",
  {},
  {
    inScheme: { light: [["true", "false"]] },
  },
);
