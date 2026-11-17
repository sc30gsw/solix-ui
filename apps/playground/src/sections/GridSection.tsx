import { Box, Grid } from "@solix/core";
import { refOf } from "#/src/ref-of.ts";

const containerBreakpoints = {
  xs: "10em",
  sm: "15em",
  md: "20em",
  lg: "25em",
  xl: "30em",
} as const;

export function GridSection() {
  return (
    <Box component="section" aria-label="Grid">
      <Grid ref={refOf("Grid")} gap={{ base: "xs", md: "lg" }}>
        <Grid.Col span={{ base: 12, md: 6 }} ref={refOf("GridCol")}>
          Half from md
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 6 }}>Other half from md</Grid.Col>
      </Grid>
      <Grid mt="md">
        <Grid.Col span={4}>A third</Grid.Col>
        <Grid.Col span={4} offset={4}>
          A third after an offset
        </Grid.Col>
      </Grid>
      <Grid mt="md">
        <Grid.Col span={6} order={{ base: 2, md: 1 }}>
          Ordered one
        </Grid.Col>
        <Grid.Col span={6} order={{ base: 1, md: 2 }}>
          Ordered two
        </Grid.Col>
      </Grid>
      <Grid mt="md">
        <Grid.Col span="content">Content column</Grid.Col>
        <Grid.Col span="auto">Auto column</Grid.Col>
        <Grid.Col span={3}>Fixed column</Grid.Col>
      </Grid>
      <Grid mt="md" columns={24} grow justify="center" align="flex-end" overflow="hidden">
        <Grid.Col span={6} h={80}>
          Grows to half
        </Grid.Col>
        <Grid.Col span={6}>Grows to the other half</Grid.Col>
      </Grid>
      <Box w={480} mt="md">
        <Grid type="container" breakpoints={containerBreakpoints}>
          <Grid.Col span={{ base: 12, md: 6 }}>Half of a wide container</Grid.Col>
          <Grid.Col span={{ base: 12, md: 6 }}>Cell</Grid.Col>
        </Grid>
      </Box>
      <Box w={240} mt="md">
        <Grid type="container" breakpoints={containerBreakpoints}>
          <Grid.Col span={{ base: 12, md: 6 }}>All of a narrow container</Grid.Col>
          <Grid.Col span={{ base: 12, md: 6 }}>Cell</Grid.Col>
        </Grid>
      </Box>
      <Box mt="md" style={{ overflow: "hidden" }}>
        <Box w={1024}>
          <Grid type="container">
            <Grid.Col span={{ base: 12, md: 6 }}>Half of a container past md</Grid.Col>
            <Grid.Col span={{ base: 12, md: 6 }}>Cell</Grid.Col>
          </Grid>
        </Box>
        <Box w={960} mt="md">
          <Grid type="container">
            <Grid.Col span={{ base: 12, md: 6 }}>All of a container short of md</Grid.Col>
            <Grid.Col span={{ base: 12, md: 6 }}>Cell</Grid.Col>
          </Grid>
        </Box>
      </Box>
    </Box>
  );
}
