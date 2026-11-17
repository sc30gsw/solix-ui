import { Box, Space } from "@solix/core";
import { refOf } from "#/src/ref-of.ts";

export function SpaceSection() {
  return (
    <Box component="section" aria-label="Space">
      <p>Above the space</p>
      <Space h={{ base: "md", md: "xl" }} ref={refOf("Space")} />
      <p>Below the space</p>
      <Box display="flex">
        <span>Before the space</span>
        <Space w="lg" />
        <span>After the space</span>
      </Box>
      <p>Above the pinned space</p>
      <Space h="xl" mih="xs" />
      <p>Below the pinned space</p>
    </Box>
  );
}
