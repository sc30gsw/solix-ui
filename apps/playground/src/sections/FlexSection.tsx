import { Box, Button, Flex } from "@solix/core";
import { refOf } from "../ref-of";

export function FlexSection() {
  return (
    <Box component="section" aria-label="Flex">
      <Flex
        ref={refOf("Flex")}
        gap={{ base: "xs", md: "xl" }}
        rowGap="sm"
        direction={{ base: "column", md: "row" }}
        align="center"
        justify="space-between"
        wrap="wrap"
      >
        <Button>First in the flex</Button>
        <Button>Second in the flex</Button>
        <Button>Third in the flex</Button>
      </Flex>
      <Flex component="ul" aria-label="Flex list" gap="lg" justify="center" p={0}>
        <li>One</li>
        <li>Two</li>
      </Flex>
    </Box>
  );
}
