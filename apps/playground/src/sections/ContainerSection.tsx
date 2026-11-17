import { Box, Container } from "@solix/core";
import { refOf } from "#/src/ref-of.ts";

export function ContainerSection() {
  return (
    <Box component="section" aria-label="Container">
      <Container bg="surface" ref={refOf("Container")}>
        <p>Inside the default container</p>
      </Container>
      <Container size="xs" bg="surface">
        <p>Inside the extra small container</p>
      </Container>
      <Container fluid bg="surface">
        <p>Inside the fluid container</p>
      </Container>
      <Container strategy="grid" size="xs" bg="surface">
        <p>In the middle column of the grid container</p>
        <div data-breakout>
          <p>Breaks out of the grid container</p>
          <div data-container>
            <p>Back to the width of the grid container</p>
          </div>
        </div>
      </Container>
    </Box>
  );
}
