import { Box, Center } from "@solix/core";
import { refOf } from "../ref-of";

export function CenterSection() {
  return (
    <Box component="section" aria-label="Center">
      <Center h={120} bg="surface" ref={refOf("Center")}>
        <span>Centered content</span>
      </Center>
      <p>
        Text before{" "}
        <Center inline component="a" href="#center">
          <span aria-hidden="true">→</span>
          <span>Inline centered link</span>
        </Center>{" "}
        text after
      </p>
    </Box>
  );
}
