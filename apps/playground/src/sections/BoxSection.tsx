import { Box, Button } from "@solix/core";
import { refOf } from "../ref-of";

export function BoxSection() {
  return (
    <Box
      component="section"
      aria-label="Style props"
      p={{ base: "xs", xs: "sm", md: "lg" }}
      ref={refOf("Box")}
    >
      <Button bg="error">Background from a style prop</Button>
      <Box mt="xl">Style prop margin</Box>
      <Box mt="xl" class="roomy">
        Consumer class margin
      </Box>
      <Box mt="xl" class="roomy" style={{ "margin-top": "var(--playground-pinned-margin)" }}>
        Consumer style margin
      </Box>
      <Box p={{ base: "xs", md: "lg" }} pt={0}>
        Longhand padding
      </Box>
      <Box mt="xl">
        <Box mt="unset">Unset margin</Box>
      </Box>
      <Box hiddenFrom="md">Hidden from md</Box>
      <Box visibleFrom="md">Visible from md</Box>
      <Box hidden display="flex">
        Hidden with a display
      </Box>
      <Box hidden="until-found" display="flex">
        Hidden until found with a display
      </Box>
    </Box>
  );
}
