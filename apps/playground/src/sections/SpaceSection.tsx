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
      <p>Above the space with a blank mih</p>
      <Space h="xl" mih={{ base: " " }} />
      <p>Above the space with mih from md</p>
      <Space h="xl" mih={{ md: "xs" }} />
      <p>Above the space with mih from md over h from lg</p>
      <Space h={{ base: "md", lg: "xl" }} mih={{ md: "xs" }} />
      <Box display="flex">
        <span>Before the space with miw from md</span>
        <Space w="lg" miw={{ md: "xs" }} />
      </Box>
    </Box>
  );
}
