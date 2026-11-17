import { Box, Button, Stack } from "@solix/core";
import { refOf } from "#/src/ref-of.ts";

export function StackSection() {
  return (
    <Box component="section" aria-label="Stack">
      <Stack ref={refOf("Stack")}>
        <Button>First in the stack</Button>
        <Button>Second in the stack</Button>
        <Button>Third in the stack</Button>
      </Stack>
      <Stack gap="xl" align="center">
        <span>Top of the centred stack</span>
        <span>Bottom of the centred stack</span>
      </Stack>
    </Box>
  );
}
