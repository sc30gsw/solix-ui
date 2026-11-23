import type * as Library from "#/src/index.ts";

export const parityGapSteps = {
  1: "Styles API completion",
  2: "Theme and provider defaults",
  3: "Colour and variant system",
  4: "Size, radius and motion",
  6: "Button",
  8: "Tabs",
  10: "TextInput",
  12: "Accordion",
  13: "Modal",
  14: "SolixProvider remainder",
} as const;

export type FollowUp = `step ${keyof typeof parityGapSteps}`;

export const drawsNoLook = "draws no look of its own";

export const specsNotYetWritten: { readonly [Name in keyof typeof Library]?: FollowUp } = {
  Box: "step 1",
  Center: "step 2",
  ColorSchemeScript: "step 2",
  Container: "step 2",
  Disclosure: "step 12",
  Flex: "step 2",
  Grid: "step 2",
  GridCol: "step 2",
  Group: "step 2",
  Modal: "step 13",
  SimpleGrid: "step 2",
  SolixProvider: "step 14",
  Space: "step 2",
  Stack: "step 2",
  Tabs: "step 8",
  TabsList: "step 8",
  TabsPanel: "step 8",
  TabsTab: "step 8",
  TextInput: "step 10",
};

export const looksNotYetWritten: {
  readonly [Name in keyof typeof Library]?: FollowUp | typeof drawsNoLook;
} = {
  Box: drawsNoLook,
  Center: drawsNoLook,
  ColorSchemeScript: drawsNoLook,
  Container: drawsNoLook,
  Disclosure: "step 12",
  Flex: drawsNoLook,
  Grid: drawsNoLook,
  GridCol: drawsNoLook,
  Group: drawsNoLook,
  Modal: "step 13",
  SimpleGrid: drawsNoLook,
  SolixProvider: drawsNoLook,
  Space: drawsNoLook,
  Stack: drawsNoLook,
  Tabs: "step 8",
  TabsList: "step 8",
  TabsPanel: "step 8",
  TabsTab: "step 8",
  TextInput: "step 10",
};
