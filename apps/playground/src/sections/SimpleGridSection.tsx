import { Box, SimpleGrid } from "@solix/core";
import { refOf } from "../ref-of";

const containerCols = { base: 1, "18em": 2, "30em": 4 } as const;

export function SimpleGridSection() {
  return (
    <Box component="section" aria-label="Simple grid">
      <SimpleGrid
        ref={refOf("SimpleGrid")}
        cols={{ base: 1, sm: 2, md: 3 }}
        spacing={{ base: "xs", md: "lg" }}
        verticalSpacing="xl"
      >
        <Box bg="surface">First cell</Box>
        <Box bg="surface">Second cell</Box>
        <Box bg="surface">Third cell</Box>
        <Box bg="surface">Fourth cell</Box>
      </SimpleGrid>
      <Box w={320} mt="md">
        <SimpleGrid type="container" cols={containerCols}>
          <Box bg="surface">Cell of the narrow container</Box>
          <Box bg="surface">Cell</Box>
          <Box bg="surface">Cell</Box>
          <Box bg="surface">Cell</Box>
        </SimpleGrid>
      </Box>
      <Box w={560} mt="md">
        <SimpleGrid type="container" cols={containerCols}>
          <Box bg="surface">
            <SimpleGrid type="container" cols={{ base: 1, "10em": 3 }}>
              <span>Cell of the nested container</span>
              <span>Cell</span>
            </SimpleGrid>
          </Box>
          <Box bg="surface">Cell of the wide container</Box>
          <Box bg="surface">Cell</Box>
          <Box bg="surface">Cell</Box>
        </SimpleGrid>
      </Box>
      <SimpleGrid minColWidth={160} mt="md">
        <Box bg="surface">Auto-filled cell</Box>
        <Box bg="surface">Cell</Box>
      </SimpleGrid>
    </Box>
  );
}
