import { Box, Button, Group } from "@solix/core";
import { refOf } from "#/src/ref-of.ts";

export function GroupSection() {
  return (
    <Box component="section" aria-label="Group">
      <Group ref={refOf("Group")}>
        <Button>First in the group</Button>
        <Button>Second in the group</Button>
        <Button>Third in the group</Button>
      </Group>
      <Group grow mt="md">
        <Button>Grows</Button>
        <Button>Grows too</Button>
        <Button>Grows as well</Button>
      </Group>
      <Group grow preventGrowOverflow={false} mt="md">
        <Button>A label wide enough to take more than its share of the row</Button>
        <Button>Short</Button>
      </Group>
    </Box>
  );
}
